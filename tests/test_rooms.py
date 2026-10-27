"""Rearing rooms: a farm has rooms, and every batch sits in one. Moving a batch keeps where it has been."""
from datetime import timedelta

import pytest
from django.utils import timezone

from audit_log.models import AuditLog
from batches.models import Batch, BatchRoomStay
from farms.models import RearingRoom
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner():
    return UserFactory(role='FARMER')


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner)


def room_url(farm):
    return f'/api/farms/{farm.pk}/rooms'


def add_room(client, farm, name='Room A', **body):
    return client.post(room_url(farm), {'name': name, **body}, format='json')


def make_room(farm, name='Room A', **kw):
    return RearingRoom.objects.create(farm=farm, name=name, **kw)


def make_batch(farm, room=None, **kw):
    batch = BatchFactory(farm=farm, **kw)
    if room is not None:
        Batch.objects.filter(pk=batch.pk).update(room=room)
        BatchRoomStay.objects.create(batch=batch, room=room, started_at=timezone.now())
        batch.refresh_from_db()
    return batch


def create_batch(client, farm, **body):
    payload = {'farmId': farm.pk, 'expectedHarvestDate': (timezone.now() + timedelta(days=25)).isoformat(), **body}
    return client.post('/api/batches', payload, format='json')


# ── making, listing, renaming and deleting rooms ────────────────────────────

def test_a_farmer_adds_a_room_to_their_farm(auth_client, owner, farm):
    response = add_room(auth_client(owner), farm, name='  Rearing house 1  ', notes='North side')
    assert response.status_code == 201
    room = RearingRoom.objects.get()
    assert (room.farm_id, room.name, room.notes, room.is_active) == (farm.pk, 'Rearing house 1', 'North side', True)
    assert response.json()['data']['name'] == 'Rearing house 1'
    assert AuditLog.objects.filter(action='CREATE', resource='Room', detail__contains='Rearing house 1').exists()


@pytest.mark.parametrize('body', [{'name': ''}, {'name': '   '}, {'name': 'x' * 101}, {}, {'name': 'Ok', 'notes': 'x' * 501}])
def test_a_room_that_makes_no_sense_is_refused(auth_client, owner, farm, body):
    response = auth_client(owner).post(room_url(farm), body, format='json')
    assert response.status_code == 422
    assert RearingRoom.objects.count() == 0


def test_a_farm_cannot_have_two_active_rooms_with_the_same_name(auth_client, owner, farm):
    client = auth_client(owner)
    add_room(client, farm, name='Room A')
    response = add_room(client, farm, name='  room a ')
    assert response.status_code == 422
    assert response.json()['message'] == 'You already have a room with that name.'
    assert RearingRoom.objects.count() == 1


def test_two_farms_can_both_have_a_room_with_the_same_name(auth_client, owner):
    client = auth_client(owner)
    assert add_room(client, FarmFactory(owner=owner), name='Room A').status_code == 201
    assert add_room(client, FarmFactory(owner=owner), name='Room A').status_code == 201


def test_the_name_of_a_deleted_room_can_be_used_again(auth_client, owner, farm):
    make_room(farm, name='Room A', is_active=False)
    assert add_room(auth_client(owner), farm, name='Room A').status_code == 201


def test_the_list_shows_each_room_with_the_batches_in_it_and_hides_deleted_rooms(auth_client, owner, farm):
    first, second = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    make_room(farm, 'Room C', is_active=False)
    inside = make_batch(farm, first, stage='LARVA')
    make_batch(farm, second)
    rows = auth_client(owner).get(room_url(farm)).json()['data']
    assert [r['name'] for r in rows] == ['Room A', 'Room B']
    assert [(b['id'], b['stage']) for b in rows[0]['batches']] == [(inside.pk, 'LARVA')]
    assert rows[0]['batchCount'] == 1


def test_a_deleted_batch_is_not_listed_in_its_room(auth_client, owner, farm):
    room = make_room(farm)
    make_batch(farm, room, is_active=False)
    assert auth_client(owner).get(room_url(farm)).json()['data'][0]['batches'] == []


def test_a_room_can_be_renamed_and_its_notes_changed(auth_client, owner, farm):
    room = make_room(farm, 'Room A')
    response = auth_client(owner).patch(f'/api/rooms/{room.pk}', {'name': 'Rearing house', 'notes': 'Near the well'}, format='json')
    assert response.status_code == 200
    room.refresh_from_db()
    assert (room.name, room.notes) == ('Rearing house', 'Near the well')


def test_renaming_to_a_name_already_used_is_refused(auth_client, owner, farm):
    make_room(farm, 'Room A')
    other = make_room(farm, 'Room B')
    response = auth_client(owner).patch(f'/api/rooms/{other.pk}', {'name': 'room a'}, format='json')
    assert response.status_code == 422
    other.refresh_from_db()
    assert other.name == 'Room B'


def test_keeping_its_own_name_while_changing_the_notes_is_fine(auth_client, owner, farm):
    room = make_room(farm, 'Room A')
    assert auth_client(owner).patch(f'/api/rooms/{room.pk}', {'name': 'Room A', 'notes': 'x'}, format='json').status_code == 200


def test_deleting_a_room_hides_it_and_keeps_the_row(auth_client, owner, farm):
    room = make_room(farm)
    response = auth_client(owner).delete(f'/api/rooms/{room.pk}')
    assert response.status_code == 200
    assert response.json()['message'] == 'Room deleted.'
    room.refresh_from_db()
    assert room.is_active is False
    assert auth_client(owner).get(room_url(farm)).json()['data'] == []
    assert AuditLog.objects.filter(action='DELETE', resource='Room').exists()


def test_a_room_with_batches_in_it_cannot_be_deleted(auth_client, owner, farm):
    room = make_room(farm)
    make_batch(farm, room)
    response = auth_client(owner).delete(f'/api/rooms/{room.pk}')
    assert response.status_code == 409
    assert response.json()['message'] == 'Move the batches out of this room first.'
    room.refresh_from_db()
    assert room.is_active is True


def test_a_deleted_batch_does_not_stop_the_room_being_deleted(auth_client, owner, farm):
    room = make_room(farm)
    make_batch(farm, room, is_active=False)
    assert auth_client(owner).delete(f'/api/rooms/{room.pk}').status_code == 200


# ── who may do what ─────────────────────────────────────────────────────────

def test_another_farmer_sees_and_changes_nothing(auth_client, farm):
    room = make_room(farm)
    stranger = auth_client(UserFactory(role='FARMER'))
    assert stranger.get(room_url(farm)).status_code == 404
    assert add_room(stranger, farm).status_code == 404
    assert stranger.patch(f'/api/rooms/{room.pk}', {'name': 'X'}, format='json').status_code == 404
    assert stranger.delete(f'/api/rooms/{room.pk}').status_code == 404


def test_a_supervisor_reads_the_rooms_of_the_cooperative_but_cannot_change_them(auth_client):
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    farm = FarmFactory(owner=farmer)
    room = make_room(farm)
    supervisor = auth_client(UserFactory(role='SUPERVISOR', cooperative=coop))
    assert len(supervisor.get(room_url(farm)).json()['data']) == 1
    assert add_room(supervisor, farm, name='Another').status_code == 403
    assert supervisor.patch(f'/api/rooms/{room.pk}', {'name': 'X'}, format='json').status_code == 403
    assert supervisor.delete(f'/api/rooms/{room.pk}').status_code == 403


def test_an_admin_can_manage_any_farms_rooms(auth_client, farm):
    admin = auth_client(UserFactory(role='ADMIN'))
    assert add_room(admin, farm).status_code == 201
    room = RearingRoom.objects.get()
    assert admin.patch(f'/api/rooms/{room.pk}', {'name': 'Renamed'}, format='json').status_code == 200
    assert admin.delete(f'/api/rooms/{room.pk}').status_code == 200


def test_signing_in_is_required(api_client, farm):
    room = make_room(farm)
    assert api_client.get(room_url(farm)).status_code == 401
    assert api_client.delete(f'/api/rooms/{room.pk}').status_code == 401


def test_the_rooms_of_a_deleted_farm_are_gone_with_it(auth_client, owner):
    farm = FarmFactory(owner=owner, is_active=False)
    room = make_room(farm)
    client = auth_client(owner)
    assert client.get(room_url(farm)).status_code == 404
    assert client.delete(f'/api/rooms/{room.pk}').status_code == 404


# ── a new batch always gets a room ──────────────────────────────────────────

def test_a_batch_on_a_farm_without_rooms_gets_room_1_made_for_it(auth_client, owner, farm):
    response = create_batch(auth_client(owner), farm)
    assert response.status_code == 201
    room = RearingRoom.objects.get()
    assert (room.farm_id, room.name) == (farm.pk, 'Room 1')
    batch = Batch.objects.get()
    assert batch.room_id == room.pk
    assert response.json()['data']['room'] == {'id': room.pk, 'name': 'Room 1'}


def test_with_one_room_the_batch_goes_there_without_being_asked(auth_client, owner, farm):
    room = make_room(farm, 'Rearing house')
    create_batch(auth_client(owner), farm)
    assert Batch.objects.get().room_id == room.pk
    assert RearingRoom.objects.count() == 1


def test_with_several_rooms_the_batch_goes_in_the_chosen_one(auth_client, owner, farm):
    make_room(farm, 'Room A')
    chosen = make_room(farm, 'Room B')
    assert create_batch(auth_client(owner), farm, roomId=chosen.pk).status_code == 201
    assert Batch.objects.get().room_id == chosen.pk


def test_with_several_rooms_a_choice_is_needed(auth_client, owner, farm):
    make_room(farm, 'Room A')
    make_room(farm, 'Room B')
    response = create_batch(auth_client(owner), farm)
    assert response.status_code == 422
    assert response.json()['message'] == 'Please choose a room.'
    assert Batch.objects.count() == 0


def test_a_room_of_another_farm_is_refused(auth_client, owner, farm):
    elsewhere = make_room(FarmFactory(owner=owner), 'Elsewhere')
    make_room(farm, 'Room A')
    response = create_batch(auth_client(owner), farm, roomId=elsewhere.pk)
    assert response.status_code == 422
    assert Batch.objects.count() == 0


def test_a_deleted_room_is_refused(auth_client, owner, farm):
    make_room(farm, 'Room A')
    gone = make_room(farm, 'Old', is_active=False)
    assert create_batch(auth_client(owner), farm, roomId=gone.pk).status_code == 422


def test_a_new_batch_starts_a_stay_in_its_room(auth_client, owner, farm):
    create_batch(auth_client(owner), farm)
    stay = BatchRoomStay.objects.get()
    batch = Batch.objects.get()
    assert (stay.batch_id, stay.room_id, stay.ended_at) == (batch.pk, batch.room_id, None)
    assert abs((stay.started_at - batch.start_date).total_seconds()) < 5


def test_the_batch_pages_say_which_room_it_is_in(auth_client, owner, farm):
    room = make_room(farm, 'Rearing house')
    batch = make_batch(farm, room)
    client = auth_client(owner)
    assert client.get(f'/api/batches/{batch.pk}').json()['data']['room'] == {'id': room.pk, 'name': 'Rearing house'}
    assert client.get(f'/api/batches/farm/{farm.pk}').json()['data'][0]['room']['name'] == 'Rearing house'
    assert client.get('/api/batches/active').json()['data'][0]['room']['name'] == 'Rearing house'


def test_a_batch_that_was_never_placed_shows_no_room(auth_client, owner, farm):
    batch = make_batch(farm)
    assert auth_client(owner).get(f'/api/batches/{batch.pk}').json()['data']['room'] is None


# ── moving a batch ──────────────────────────────────────────────────────────

def move(client, batch, room):
    return client.post(f'/api/batches/{batch.pk}/room', {'roomId': room.pk}, format='json')


def test_moving_closes_the_old_stay_and_opens_a_new_one(auth_client, owner, farm):
    old, new = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    batch = make_batch(farm, old)
    response = move(auth_client(owner), batch, new)
    assert response.status_code == 200
    assert response.json()['message'] == 'Batch moved.'
    batch.refresh_from_db()
    assert batch.room_id == new.pk
    stays = list(BatchRoomStay.objects.filter(batch=batch).order_by('started_at'))
    assert [s.room_id for s in stays] == [old.pk, new.pk]
    assert stays[0].ended_at is not None and stays[1].ended_at is None
    assert stays[0].ended_at == stays[1].started_at
    assert AuditLog.objects.filter(action='UPDATE', resource='Batch', detail__contains='Room B').exists()


def test_moving_back_to_a_room_it_left_opens_a_third_stay(auth_client, owner, farm):
    a, b = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    batch = make_batch(farm, a)
    client = auth_client(owner)
    move(client, batch, b)
    move(client, batch, a)
    assert BatchRoomStay.objects.filter(batch=batch).count() == 3
    assert BatchRoomStay.objects.filter(batch=batch, ended_at__isnull=True).get().room_id == a.pk


def test_moving_to_the_room_it_is_already_in_changes_nothing(auth_client, owner, farm):
    room = make_room(farm)
    batch = make_batch(farm, room)
    assert move(auth_client(owner), batch, room).status_code == 200
    assert BatchRoomStay.objects.filter(batch=batch).count() == 1


def test_a_batch_can_be_placed_when_it_never_had_a_room(auth_client, owner, farm):
    room = make_room(farm)
    batch = make_batch(farm)
    assert move(auth_client(owner), batch, room).status_code == 200
    assert BatchRoomStay.objects.get(batch=batch).ended_at is None


def test_a_room_of_another_farm_or_a_deleted_room_cannot_be_moved_into(auth_client, owner, farm):
    room = make_room(farm, 'Room A')
    batch = make_batch(farm, room)
    client = auth_client(owner)
    assert move(client, batch, make_room(FarmFactory(owner=owner), 'Elsewhere')).status_code == 422
    assert move(client, batch, make_room(farm, 'Old', is_active=False)).status_code == 422
    batch.refresh_from_db()
    assert batch.room_id == room.pk
    assert BatchRoomStay.objects.filter(batch=batch).count() == 1


def test_only_the_owner_or_an_admin_can_move_a_batch(auth_client, owner, farm):
    a, b = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    batch = make_batch(farm, a)
    assert move(auth_client(UserFactory(role='FARMER')), batch, b).status_code == 404
    assert move(auth_client(UserFactory(role='SUPERVISOR')), batch, b).status_code == 403
    assert move(auth_client(UserFactory(role='ADMIN')), batch, b).status_code == 200


def test_a_deleted_batch_cannot_be_moved(auth_client, owner, farm):
    a, b = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    batch = make_batch(farm, a, is_active=False)
    assert move(auth_client(owner), batch, b).status_code == 404


def test_deleting_a_batch_takes_it_out_of_its_room_and_ends_its_stay(auth_client, owner, farm):
    room = make_room(farm)
    batch = make_batch(farm, room)
    assert auth_client(owner).delete(f'/api/batches/{batch.pk}').status_code == 200
    batch.refresh_from_db()
    assert batch.room_id is None
    assert BatchRoomStay.objects.get(batch=batch).ended_at is not None


def test_the_batch_page_carries_where_it_has_been(auth_client, owner, farm):
    a, b = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    batch = make_batch(farm, a)
    client = auth_client(owner)
    move(client, batch, b)
    history = client.get(f'/api/batches/{batch.pk}').json()['data']['roomStays']
    assert [(h['roomName'], h['endedAt'] is None) for h in history] == [('Room B', True), ('Room A', False)]


# ── existing batches ────────────────────────────────────────────────────────

def test_the_backfill_puts_every_existing_batch_in_room_1_of_its_farm_with_a_stay_from_its_start():
    from django.apps import apps

    from farms.room_backfill import backfill

    farm, empty_farm = FarmFactory(), FarmFactory()
    live = BatchFactory(farm=farm)
    deleted = BatchFactory(farm=farm, is_active=False)
    Batch.objects.filter(pk__in=[live.pk, deleted.pk]).update(room=None)
    BatchRoomStay.objects.all().delete()
    RearingRoom.objects.all().delete()

    backfill(apps)

    room = RearingRoom.objects.get()
    assert (room.farm_id, room.name) == (farm.pk, 'Room 1')
    assert not RearingRoom.objects.filter(farm=empty_farm).exists()
    live.refresh_from_db()
    deleted.refresh_from_db()
    assert live.room_id == room.pk
    stay = BatchRoomStay.objects.get(batch=live)
    assert (stay.room_id, stay.started_at, stay.ended_at) == (room.pk, live.start_date, None)
    assert deleted.room_id is None
    assert BatchRoomStay.objects.get(batch=deleted).ended_at is not None


def test_the_backfill_can_run_twice_without_making_a_second_room():
    from django.apps import apps

    from farms.room_backfill import backfill

    batch = BatchFactory()
    Batch.objects.filter(pk=batch.pk).update(room=None)
    backfill(apps)
    backfill(apps)
    assert RearingRoom.objects.count() == 1
    assert BatchRoomStay.objects.count() == 1


# ── sensors and the latest reading ──────────────────────────────────────────

def test_a_room_lists_its_sensors_and_the_latest_thing_they_measured(auth_client, owner, farm):
    from sensors.models import IoTDevice, SensorReading
    from tests.factories import IoTDeviceFactory

    room = make_room(farm, 'Room A')
    other = make_room(farm, 'Room B')
    sensor = IoTDeviceFactory(farm=farm, room=room, name='Sensor 1', status='online', last_seen=timezone.now())
    IoTDeviceFactory(farm=farm, room=room, name='Gone', is_active=False)
    IoTDeviceFactory(farm=farm, room=other, name='Elsewhere')
    for hours_ago, temperature in ((3, 20.0), (1, 26.5), (2, 22.0)):
        row = SensorReading.objects.create(room=room, device=sensor, temperature=temperature, humidity=70.0 + hours_ago)
        SensorReading.objects.filter(pk=row.pk).update(timestamp=timezone.now() - timedelta(hours=hours_ago))
    rows = {r['id']: r for r in auth_client(owner).get(room_url(farm)).json()['data']}
    first = rows[room.pk]
    assert [(d['name'], d['status']) for d in first['devices']] == [('Sensor 1', 'online')]
    assert (first['latestReading']['temperature'], first['latestReading']['humidity']) == (26.5, 71.0)
    assert rows[other.pk]['latestReading'] is None
    assert [d['name'] for d in rows[other.pk]['devices']] == ['Elsewhere']
    assert IoTDevice.objects.count() == 3


def test_a_quiet_sensor_is_listed_as_offline_even_if_nobody_ran_the_job(auth_client, owner, farm):
    from tests.factories import IoTDeviceFactory

    room = make_room(farm)
    IoTDeviceFactory(farm=farm, room=room, status='online', last_seen=timezone.now() - timedelta(hours=3))
    assert auth_client(owner).get(room_url(farm)).json()['data'][0]['devices'][0]['status'] == 'offline'


def test_the_room_list_costs_the_same_however_many_rooms_and_sensors_there_are(auth_client, owner, farm):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    from sensors.models import SensorReading
    from tests.factories import IoTDeviceFactory

    client = auth_client(owner)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            assert client.get(room_url(farm)).status_code == 200
        return len(captured)

    first = make_room(farm, 'Room 0')
    IoTDeviceFactory(farm=farm, room=first)
    SensorReading.objects.create(room=first, temperature=24.0, humidity=70.0)
    few = queries()
    for index in range(1, 6):
        extra = make_room(farm, f'Room {index}')
        make_batch(farm, extra)
        IoTDeviceFactory(farm=farm, room=extra)
        SensorReading.objects.create(room=extra, temperature=24.0, humidity=70.0)
    assert queries() <= few + 1
