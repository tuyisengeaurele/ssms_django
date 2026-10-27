"""A device sends readings with its own key, and no user account is involved."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from alerts.models import AlertLog
from sensors.models import IoTDevice, SensorReading
from tests.factories import BatchFactory, FarmFactory, IoTDeviceFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = '/api/devices/ingest'
GOOD = {'temperature': 25.0, 'humidity': 78.0}


@pytest.fixture
def device():
    batch = BatchFactory()
    return IoTDeviceFactory(farm=batch.farm, batch=batch, device_key='ssms-test-key-0001', status='offline', last_seen=None)


def send(key, body=None, client=None):
    client = client or APIClient()
    headers = {'HTTP_X_DEVICE_KEY': key} if key is not None else {}
    return client.post(URL, GOOD if body is None else body, format='json', **headers)


def test_a_valid_key_stores_the_reading_on_the_devices_batch(device):
    response = send(device.device_key)
    assert response.status_code == 201
    reading = SensorReading.objects.get()
    assert (reading.batch_id, reading.device_id, reading.temperature, reading.humidity) == (device.batch_id, device.pk, 25.0, 78.0)


def test_the_device_is_marked_online_and_seen_now(device):
    send(device.device_key)
    device.refresh_from_db()
    assert device.status == 'online'
    assert timezone.now() - device.last_seen < timedelta(seconds=10)


def test_the_answer_never_repeats_the_key(device):
    assert device.device_key not in send(device.device_key).content.decode()


@pytest.mark.parametrize('key', [None, '', 'ssms-wrong-key'])
def test_a_missing_or_wrong_key_is_refused_with_one_message(key):
    response = send(key)
    assert response.status_code == 401
    assert response.json()['message'] == "That device key isn't valid."
    assert SensorReading.objects.count() == 0


def test_a_switched_off_device_is_refused_like_an_unknown_one(device):
    IoTDevice.objects.filter(pk=device.pk).update(is_active=False)
    response = send(device.device_key)
    assert response.status_code == 401
    assert response.json()['message'] == "That device key isn't valid."


def test_the_key_is_only_read_from_the_header(device):
    response = APIClient().post(f'{URL}?deviceKey={device.device_key}', GOOD, format='json')
    assert response.status_code == 401


def test_a_person_logged_in_without_a_key_is_still_refused(auth_client):
    response = auth_client(UserFactory(role='ADMIN')).post(URL, GOOD, format='json')
    assert response.status_code == 401


def test_a_bad_reading_opens_one_alert_and_more_bad_readings_open_no_more(device):
    send(device.device_key, {'temperature': 20.0, 'humidity': 78.0})
    send(device.device_key, {'temperature': 19.5, 'humidity': 78.0})
    assert AlertLog.objects.filter(batch=device.batch, type='TEMPERATURE').count() == 1


def test_without_its_own_batch_a_device_uses_the_single_active_batch_of_its_farm():
    batch = BatchFactory()
    device = IoTDeviceFactory(farm=batch.farm, batch=None, device_key='ssms-test-key-0002')
    assert send(device.device_key).status_code == 201
    assert SensorReading.objects.get().batch_id == batch.pk


def test_a_farm_with_two_active_batches_needs_the_device_linked_to_one():
    farm = FarmFactory()
    BatchFactory(farm=farm)
    BatchFactory(farm=farm)
    device = IoTDeviceFactory(farm=farm, batch=None, device_key='ssms-test-key-0003')
    response = send(device.device_key)
    assert response.status_code == 409
    assert response.json()['message'] == 'This device is not linked to a batch yet.'
    assert SensorReading.objects.count() == 0


def test_a_farm_with_no_active_batch_has_nowhere_to_put_the_reading():
    device = IoTDeviceFactory(farm=FarmFactory(), batch=None, device_key='ssms-test-key-0004')
    assert send(device.device_key).status_code == 409


def test_a_deleted_batch_does_not_receive_readings(device):
    type(device.batch).objects.filter(pk=device.batch_id).update(is_active=False)
    assert send(device.device_key).status_code == 409


@pytest.mark.parametrize('body', [
    {}, {'temperature': 25.0}, {'humidity': 78.0},
    {'temperature': 'hot', 'humidity': 78.0}, {'temperature': 120.0, 'humidity': 78.0},
    {'temperature': -50.0, 'humidity': 78.0}, {'temperature': 25.0, 'humidity': 130.0},
    {'temperature': 25.0, 'humidity': -1.0}, {'temperature': 'nan', 'humidity': 78.0}, {'temperature': 25.0, 'humidity': 'inf'},
])
def test_a_reading_that_cannot_be_true_is_refused_and_not_stored(device, body):
    response = send(device.device_key, body)
    assert response.status_code == 422
    assert SensorReading.objects.count() == 0


def test_a_device_cannot_send_more_than_thirty_readings_a_minute(device):
    other = IoTDeviceFactory(farm=device.farm, batch=device.batch, device_key='ssms-test-key-0005')
    codes = [send(device.device_key).status_code for _ in range(32)]
    assert codes[:30] == [201] * 30
    assert codes[30:] == [429, 429]
    assert send(other.device_key).status_code == 201
