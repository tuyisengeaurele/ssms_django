"""Existing devices and readings are put in a room by a migration, and it can be run again safely."""
from datetime import timedelta

import pytest
from django.apps import apps
from django.utils import timezone

from batches.placement import leave_room, place_batch
from farms.models import RearingRoom
from sensors.models import IoTDevice, SensorReading
from sensors.room_backfill import backfill
from tests.factories import BatchFactory, FarmFactory, IoTDeviceFactory

pytestmark = pytest.mark.django_db


def legacy_reading(batch):
    return SensorReading.objects.create(batch=batch, temperature=24.0, humidity=70.0)


def test_a_reading_gets_the_room_its_batch_is_in_and_keeps_its_batch():
    farm = FarmFactory()
    room = RearingRoom.objects.create(farm=farm, name='Room 1')
    batch = BatchFactory(farm=farm)
    place_batch(batch, room)
    row = legacy_reading(batch)
    backfill(apps)
    row.refresh_from_db()
    assert (row.room_id, row.batch_id) == (room.pk, batch.pk)


def test_a_reading_of_a_deleted_batch_gets_the_room_of_its_last_stay():
    farm = FarmFactory()
    room = RearingRoom.objects.create(farm=farm, name='Room 1')
    batch = BatchFactory(farm=farm)
    place_batch(batch, room, when=timezone.now() - timedelta(days=3))
    row = legacy_reading(batch)
    leave_room(batch)
    backfill(apps)
    row.refresh_from_db()
    assert row.room_id == room.pk


def test_a_reading_of_a_batch_that_was_never_placed_is_left_alone():
    row = legacy_reading(BatchFactory())
    backfill(apps)
    row.refresh_from_db()
    assert row.room_id is None


def test_a_device_gets_the_room_of_its_batch():
    farm = FarmFactory()
    first, second = RearingRoom.objects.create(farm=farm, name='Room 1'), RearingRoom.objects.create(farm=farm, name='Room 2')
    batch = BatchFactory(farm=farm)
    place_batch(batch, second)
    device = IoTDeviceFactory(farm=farm, batch=batch)
    backfill(apps)
    device.refresh_from_db()
    assert device.room_id == second.pk
    assert first.pk != device.room_id


def test_a_device_with_only_a_farm_gets_the_first_room_of_that_farm():
    farm = FarmFactory()
    first = RearingRoom.objects.create(farm=farm, name='Room 1')
    RearingRoom.objects.create(farm=farm, name='Room 2')
    device = IoTDeviceFactory(farm=farm, batch=None)
    backfill(apps)
    device.refresh_from_db()
    assert device.room_id == first.pk


def test_a_device_on_a_farm_without_rooms_stays_unplaced():
    device = IoTDeviceFactory(farm=FarmFactory(), batch=None)
    backfill(apps)
    device.refresh_from_db()
    assert device.room_id is None


def test_running_it_twice_changes_nothing_more():
    farm = FarmFactory()
    room = RearingRoom.objects.create(farm=farm, name='Room 1')
    batch = BatchFactory(farm=farm)
    place_batch(batch, room)
    legacy_reading(batch)
    IoTDeviceFactory(farm=farm, batch=batch)
    backfill(apps)
    def state():
        return list(SensorReading.objects.values_list('pk', 'room_id')), list(IoTDevice.objects.values_list('pk', 'room_id'))

    first = state()
    backfill(apps)
    assert state() == first
