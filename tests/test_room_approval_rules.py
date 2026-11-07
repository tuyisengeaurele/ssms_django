"""A room that is not approved holds nothing: no batch, no sensor. An approved room with a size change waiting still does.

A farm with no approved room can no longer start a batch, and "Room 1" is not made for it any more: the farmer is told to
add a room and wait for the supervisor.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from batches.models import Batch
from batches.placement import place_batch
from farms.models import RearingRoom
from farms.room_review import NO_APPROVED_ROOM, ROOM_NOT_APPROVED
from sensors.devices import room_for_device
from sensors.models import IoTDevice
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

Approval = RearingRoom.Approval


@pytest.fixture
def world():
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    return farmer, FarmFactory(owner=farmer)


def room_of(farm, name='A', status=Approval.APPROVED, **fields):
    return RearingRoom.objects.create(farm=farm, name=name, approval_status=status, area_m2=Decimal('12'), **fields)


def start(client, farm, **body):
    payload = {'farmId': farm.pk, 'expectedHarvestDate': (timezone.now() + timedelta(days=25)).isoformat(), **body}
    return client.post('/api/batches', payload, format='json')


def refused(response, code, message):
    assert response.status_code == 422, response.content
    assert response.json()['code'] == code and response.json()['message'] == message
    assert 'roomId' in response.json()['errors']


# ── starting a batch ──────────────────────────────────────────────────────────

def test_a_farm_with_no_room_cannot_start_a_batch_and_gets_no_room_made_for_it(auth_client, world):
    farmer, farm = world
    refused(start(auth_client(farmer), farm), 'no_approved_room', NO_APPROVED_ROOM)
    assert RearingRoom.objects.count() == 0 and Batch.objects.count() == 0


@pytest.mark.parametrize('status', [Approval.PENDING, Approval.REJECTED])
def test_a_farm_whose_only_room_is_not_approved_cannot_start_a_batch(auth_client, world, status):
    farmer, farm = world
    room_of(farm, status=status)
    refused(start(auth_client(farmer), farm), 'no_approved_room', NO_APPROVED_ROOM)
    assert Batch.objects.count() == 0


def test_the_only_approved_room_is_used_when_none_is_named(auth_client, world):
    farmer, farm = world
    room = room_of(farm)
    response = start(auth_client(farmer), farm)
    assert response.status_code == 201
    assert Batch.objects.get().room_id == room.pk


def test_an_approved_room_is_used_even_when_another_room_waits(auth_client, world):
    farmer, farm = world
    approved = room_of(farm, 'Ready')
    room_of(farm, 'Waiting', status=Approval.PENDING)
    assert start(auth_client(farmer), farm).status_code == 201
    assert Batch.objects.get().room_id == approved.pk


def test_with_several_approved_rooms_the_farmer_still_has_to_choose(auth_client, world):
    farmer, farm = world
    room_of(farm, 'One')
    room_of(farm, 'Two')
    assert start(auth_client(farmer), farm).status_code == 422


@pytest.mark.parametrize('status', [Approval.PENDING, Approval.REJECTED])
def test_choosing_a_room_that_is_not_approved_is_refused(auth_client, world, status):
    farmer, farm = world
    room_of(farm, 'Ready')
    blocked = room_of(farm, 'Blocked', status=status)
    refused(start(auth_client(farmer), farm, roomId=blocked.pk), 'room_not_approved', ROOM_NOT_APPROVED)
    assert Batch.objects.count() == 0


def test_a_room_with_a_size_change_waiting_still_takes_batches(auth_client, world):
    farmer, farm = world
    room = room_of(farm, pending_area_m2=Decimal('30'))
    assert room.usable and room.needs_review
    assert start(auth_client(farmer), farm).status_code == 201


# ── moving a batch ────────────────────────────────────────────────────────────

def batch_in(farm, room):
    batch = BatchFactory(farm=farm)
    place_batch(batch, room)
    return batch


@pytest.mark.parametrize('status', [Approval.PENDING, Approval.REJECTED])
def test_a_batch_cannot_be_moved_into_a_room_that_is_not_approved(auth_client, world, status):
    farmer, farm = world
    batch = batch_in(farm, room_of(farm, 'From'))
    target = room_of(farm, 'To', status=status)
    refused(auth_client(farmer).post(f'/api/batches/{batch.pk}/room', {'roomId': target.pk}, format='json'), 'room_not_approved', ROOM_NOT_APPROVED)
    batch.refresh_from_db()
    assert batch.room_id != target.pk


def test_a_batch_moves_into_an_approved_room(auth_client, world):
    farmer, farm = world
    batch = batch_in(farm, room_of(farm, 'From'))
    target = room_of(farm, 'To')
    assert auth_client(farmer).post(f'/api/batches/{batch.pk}/room', {'roomId': target.pk}, format='json').status_code == 200
    batch.refresh_from_db()
    assert batch.room_id == target.pk


# ── sensors ───────────────────────────────────────────────────────────────────

def register(client, farm, **body):
    return client.post('/api/devices', {'name': 'Sensor 1', 'farmId': farm.pk, **body}, format='json')


@pytest.mark.parametrize('status', [Approval.PENDING, Approval.REJECTED])
def test_a_sensor_cannot_be_given_a_room_that_is_not_approved(auth_client, world, status):
    _, farm = world
    room = room_of(farm, status=status)
    refused(register(auth_client(UserFactory(role='ADMIN')), farm, roomId=room.pk), 'room_not_approved', ROOM_NOT_APPROVED)
    assert IoTDevice.objects.count() == 0


def test_a_sensor_goes_in_an_approved_room(auth_client, world):
    _, farm = world
    room = room_of(farm)
    response = register(auth_client(UserFactory(role='ADMIN')), farm, roomId=room.pk)
    assert response.status_code == 201
    assert IoTDevice.objects.get().room_id == room.pk


def test_the_single_room_shortcut_ignores_a_room_that_is_not_approved(auth_client, world):
    _, farm = world
    room_of(farm, status=Approval.PENDING)
    assert register(auth_client(UserFactory(role='ADMIN')), farm).status_code == 201
    assert IoTDevice.objects.get().room_id is None


def test_the_single_room_shortcut_still_picks_the_one_approved_room(auth_client, world):
    _, farm = world
    room = room_of(farm, 'Ready')
    room_of(farm, 'Waiting', status=Approval.PENDING)
    register(auth_client(UserFactory(role='ADMIN')), farm)
    assert IoTDevice.objects.get().room_id == room.pk


def test_a_sensor_cannot_be_moved_into_a_room_that_is_not_approved(auth_client, world):
    _, farm = world
    admin = auth_client(UserFactory(role='ADMIN'))
    device = IoTDevice.objects.create(name='S', device_key='k1', farm=farm, room=room_of(farm, 'From'))
    waiting = room_of(farm, 'To', status=Approval.PENDING)
    refused(admin.patch(f'/api/devices/{device.pk}', {'roomId': waiting.pk}, format='json'), 'room_not_approved', ROOM_NOT_APPROVED)
    ready = room_of(farm, 'Ready')
    assert admin.patch(f'/api/devices/{device.pk}', {'roomId': ready.pk}, format='json').status_code == 200


def test_a_reading_goes_nowhere_for_a_device_that_was_never_placed_on_a_farm_with_one_unapproved_room(world):
    _, farm = world
    room_of(farm, status=Approval.PENDING)
    device = IoTDevice.objects.create(name='S', device_key='k2', farm=farm, room=None)
    assert room_for_device(device) is None
