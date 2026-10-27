"""A device sends readings with its own key, and no user account is involved. Its reading belongs to its room."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from alerts.models import AlertLog
from batches.placement import place_batch
from farms.models import RearingRoom
from sensors.models import IoTDevice, SensorReading
from tests.factories import BatchFactory, FarmFactory, IoTDeviceFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = '/api/devices/ingest'
GOOD = {'temperature': 25.0, 'humidity': 78.0}
MESSAGE = "That device key isn't valid."


@pytest.fixture
def farm():
    return FarmFactory()


@pytest.fixture
def room(farm):
    return RearingRoom.objects.create(farm=farm, name='Room A')


@pytest.fixture
def batch(farm, room):
    batch = BatchFactory(farm=farm)
    place_batch(batch, room)
    return batch


@pytest.fixture
def device(farm, room, batch):
    return IoTDeviceFactory(farm=farm, room=room, device_key='ssms-test-key-0001', status='offline', last_seen=None)


def send(key, body=None, client=None):
    client = client or APIClient()
    headers = {'HTTP_X_DEVICE_KEY': key} if key is not None else {}
    return client.post(URL, GOOD if body is None else body, format='json', **headers)


def test_a_valid_key_stores_the_reading_on_the_devices_room(device, room):
    response = send(device.device_key)
    assert response.status_code == 201
    reading = SensorReading.objects.get()
    assert (reading.room_id, reading.device_id, reading.batch_id, reading.temperature, reading.humidity) == (room.pk, device.pk, None, 25.0, 78.0)


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
    assert response.json()['message'] == MESSAGE
    assert SensorReading.objects.count() == 0


def test_a_switched_off_device_is_refused_like_an_unknown_one(device):
    IoTDevice.objects.filter(pk=device.pk).update(is_active=False)
    response = send(device.device_key)
    assert (response.status_code, response.json()['message']) == (401, MESSAGE)


def test_a_device_in_a_deleted_room_is_refused_like_an_unknown_one_and_its_history_stays(device, room):
    send(device.device_key)
    RearingRoom.objects.filter(pk=room.pk).update(is_active=False)
    response = send(device.device_key)
    assert (response.status_code, response.json()['message']) == (401, MESSAGE)
    assert SensorReading.objects.count() == 1


def test_the_key_is_only_read_from_the_header(device):
    assert APIClient().post(f'{URL}?deviceKey={device.device_key}', GOOD, format='json').status_code == 401


def test_a_person_logged_in_without_a_key_is_still_refused(auth_client):
    assert auth_client(UserFactory(role='ADMIN')).post(URL, GOOD, format='json').status_code == 401


# ── what the reading does to the batches in the room ────────────────────────

def test_a_bad_reading_opens_one_alert_for_the_batch_and_more_bad_readings_open_no_more(device, batch):
    send(device.device_key, {'temperature': 20.0, 'humidity': 78.0})
    send(device.device_key, {'temperature': 19.5, 'humidity': 78.0})
    assert AlertLog.objects.filter(batch=batch, type='TEMPERATURE').count() == 1


def test_a_bad_reading_alerts_every_running_batch_in_the_room(device, farm, room, batch):
    second = BatchFactory(farm=farm)
    place_batch(second, room)
    send(device.device_key, {'temperature': 20.0, 'humidity': 78.0})
    assert AlertLog.objects.filter(batch=batch, type='TEMPERATURE').count() == 1
    assert AlertLog.objects.filter(batch=second, type='TEMPERATURE').count() == 1


def test_a_room_with_no_batch_still_stores_the_reading_and_alerts_nobody(farm):
    empty = RearingRoom.objects.create(farm=farm, name='Empty room')
    device = IoTDeviceFactory(farm=farm, room=empty, device_key='ssms-test-key-0007')
    assert send(device.device_key, {'temperature': 20.0, 'humidity': 78.0}).status_code == 201
    assert SensorReading.objects.get().room_id == empty.pk
    assert AlertLog.objects.count() == 0


def test_two_devices_in_one_room_both_feed_it(farm, room, batch):
    one = IoTDeviceFactory(farm=farm, room=room, device_key='ssms-test-key-0011')
    two = IoTDeviceFactory(farm=farm, room=room, device_key='ssms-test-key-0012')
    send(one.device_key)
    send(two.device_key)
    assert SensorReading.objects.filter(room=room).count() == 2


# ── a device that is not in a room ──────────────────────────────────────────

def test_without_a_room_a_device_uses_the_only_room_of_its_farm(farm):
    only = RearingRoom.objects.create(farm=farm, name='Only room')
    device = IoTDeviceFactory(farm=farm, room=None, device_key='ssms-test-key-0002')
    assert send(device.device_key).status_code == 201
    assert SensorReading.objects.get().room_id == only.pk


def test_a_farm_with_two_rooms_needs_the_device_placed_in_one(farm):
    RearingRoom.objects.create(farm=farm, name='Room A')
    RearingRoom.objects.create(farm=farm, name='Room B')
    device = IoTDeviceFactory(farm=farm, room=None, device_key='ssms-test-key-0003')
    response = send(device.device_key)
    assert response.status_code == 409
    assert response.json()['message'] == 'This device is not in a room yet.'
    assert SensorReading.objects.count() == 0


def test_a_farm_with_no_room_has_nowhere_to_put_the_reading(farm):
    device = IoTDeviceFactory(farm=farm, room=None, device_key='ssms-test-key-0004')
    assert send(device.device_key).status_code == 409


# ── what a device may send ──────────────────────────────────────────────────

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


def test_a_device_cannot_send_more_than_thirty_readings_a_minute(device, farm, room):
    other = IoTDeviceFactory(farm=farm, room=room, device_key='ssms-test-key-0005')
    codes = [send(device.device_key).status_code for _ in range(32)]
    assert codes[:30] == [201] * 30
    assert codes[30:] == [429, 429]
    assert send(other.device_key).status_code == 201
