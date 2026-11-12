"""The devices list shows each device's own newest reading, however the list is built."""
from datetime import timedelta

import pytest
from django.utils import timezone

from sensors.models import SensorReading
from tests.factories import FarmFactory, IoTDeviceFactory, SensorReadingFactory, UserFactory

pytestmark = pytest.mark.django_db


def reading(device, temperature, minutes_ago):
    row = SensorReadingFactory(device=device, temperature=temperature, humidity=70.0)
    # The time is set by the database when a reading is saved, so it is moved back afterwards.
    SensorReading.objects.filter(pk=row.pk).update(timestamp=timezone.now() - timedelta(minutes=minutes_ago))
    return row


def listed(client):
    response = client.get('/api/devices')
    assert response.status_code == 200
    return {item['id']: item for item in response.json()['data']}


def test_each_device_shows_its_own_newest_reading_and_none_when_it_has_no_reading(auth_client):
    owner = UserFactory(role='FARMER')
    farm = FarmFactory(owner=owner)
    busy, quiet, silent = (IoTDeviceFactory(farm=farm) for _ in range(3))
    reading(busy, 18.0, minutes_ago=90)
    reading(busy, 26.5, minutes_ago=5)     # the newest of the busy device
    reading(busy, 21.0, minutes_ago=40)
    reading(quiet, 23.0, minutes_ago=300)  # the only one, and an old one

    rows = listed(auth_client(owner))

    assert rows[busy.pk]['latestReading']['temperature'] == 26.5
    assert rows[quiet.pk]['latestReading']['temperature'] == 23.0
    assert rows[silent.pk]['latestReading'] is None


def test_a_reading_of_another_device_is_never_shown(auth_client):
    owner = UserFactory(role='FARMER')
    farm = FarmFactory(owner=owner)
    mine, other = IoTDeviceFactory(farm=farm), IoTDeviceFactory(farm=farm)
    reading(other, 30.0, minutes_ago=1)

    assert listed(auth_client(owner))[mine.pk]['latestReading'] is None


def test_the_single_device_page_shows_the_same_newest_reading(auth_client):
    owner = UserFactory(role='FARMER')
    device = IoTDeviceFactory(farm=FarmFactory(owner=owner))
    reading(device, 19.0, minutes_ago=60)
    reading(device, 24.5, minutes_ago=2)

    response = auth_client(owner).get(f'/api/devices/{device.pk}')

    assert response.status_code == 200
    assert response.json()['data']['latestReading']['temperature'] == 24.5
