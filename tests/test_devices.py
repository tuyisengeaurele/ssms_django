import pytest

from sensors.models import IoTDevice
from tests.factories import FarmFactory, IoTDeviceFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN')


def test_a_device_can_be_registered_with_camel_case_json(auth_client, admin):
    farm = FarmFactory()
    response = auth_client(admin).post(
        '/api/devices', {'name': 'Shed 1', 'farmId': farm.pk, 'location': 'North wall'}, format='json',
    )
    assert response.status_code == 201
    device = IoTDevice.objects.get(pk=response.json()['data']['id'])
    assert device.farm_id == farm.pk
    assert device.location == 'North wall'
    assert device.device_key.startswith('ssms-')


def test_an_explicit_device_key_is_kept(auth_client, admin):
    farm = FarmFactory()
    response = auth_client(admin).post(
        '/api/devices', {'name': 'Shed 2', 'farmId': farm.pk, 'deviceKey': 'ssms-my-own-key-0001'}, format='json',
    )
    assert response.status_code == 201
    assert response.json()['data']['deviceKey'] == 'ssms-my-own-key-0001'


def test_a_device_key_cannot_be_registered_twice(auth_client, admin):
    farm = FarmFactory()
    IoTDeviceFactory(device_key='ssms-taken-0001', farm=farm)
    response = auth_client(admin).post(
        '/api/devices', {'name': 'Again', 'farmId': farm.pk, 'deviceKey': 'ssms-taken-0001'}, format='json',
    )
    assert response.status_code == 409


def test_a_missing_name_or_farm_is_a_friendly_400(auth_client, admin):
    client = auth_client(admin)
    assert client.post('/api/devices', {'farmId': 'x'}, format='json').status_code == 400
    assert client.post('/api/devices', {'name': 'No farm'}, format='json').status_code == 400
