"""What the screens get for an alert that belongs to a room."""
from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from alerts.models import AlertLog
from batches.placement import place_batch
from farms.models import RearingRoom
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def owner(coop):
    return UserFactory(role='FARMER', cooperative=coop, name='Mugisha Serge')


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner)


@pytest.fixture
def room(farm):
    return RearingRoom.objects.create(farm=farm, name='Rearing house 1')


def put(farm, room, stage='PUPA', hours=48):
    batch = BatchFactory(farm=farm, stage=stage)
    place_batch(batch, room, when=timezone.now() - timedelta(hours=hours))
    return batch


def room_alert(room, type_='TEMPERATURE', **kw):
    return AlertLog.objects.create(room=room, type=type_, message='Temperature too low: 20.5 °C (safe min is 22.0 °C). Check heating.', **kw)


def listed(client, query=''):
    return client.get(f'/api/alerts?unread=false{query}').json()['data']


# ── what an alert looks like ────────────────────────────────────────────────

def test_a_room_alert_names_its_room_the_batches_in_it_and_the_farmer(auth_client, owner, farm, room):
    first, second = put(farm, room, 'LARVA'), put(farm, room, 'PUPA')
    room_alert(room)
    row = listed(auth_client(owner))[0]
    assert row['roomId'] == room.pk
    assert row['room'] == {'id': room.pk, 'name': 'Rearing house 1'}
    assert row['batchId'] is None and row['batch'] is None
    assert sorted(b['id'] for b in row['batches']) == sorted([first.pk, second.pk])
    assert {b['stage'] for b in row['batches']} == {'LARVA', 'PUPA'}
    assert row['farmerName'] == 'Mugisha Serge'


def test_the_batches_of_an_alert_are_the_ones_in_the_room_now_and_not_deleted_ones(auth_client, owner, farm, room):
    kept, gone = put(farm, room), put(farm, room)
    gone.is_active = False
    gone.save(update_fields=['is_active'])
    room_alert(room)
    assert [b['id'] for b in listed(auth_client(owner))[0]['batches']] == [kept.pk]


def test_an_alert_that_belongs_to_a_batch_still_looks_as_before(auth_client, owner, farm, room):
    batch = put(farm, room)
    AlertLog.objects.create(batch=batch, type='STAGE_CHANGE', message='Moved to Pupa')
    row = listed(auth_client(owner))[0]
    assert row['batchId'] == batch.pk
    assert row['batch'] == {'id': batch.pk, 'stage': 'PUPA'}
    assert row['room'] is None and row['roomId'] is None
    assert row['batches'] == []


def test_the_list_costs_the_same_however_many_room_alerts_there_are(auth_client, owner, farm):
    client = auth_client(owner)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            assert client.get('/api/alerts?unread=false').status_code == 200
        return len(captured)

    first = RearingRoom.objects.create(farm=farm, name='Room 0')
    put(farm, first)
    room_alert(first)
    few = queries()
    for index in range(1, 6):
        extra = RearingRoom.objects.create(farm=farm, name=f'Room {index}')
        put(farm, extra)
        put(farm, extra)
        room_alert(extra)
    assert queries() <= few + 1


# ── who may see it ──────────────────────────────────────────────────────────

def test_the_owner_a_supervisor_of_the_cooperative_and_an_admin_see_a_room_alert(auth_client, coop, owner, farm, room):
    put(farm, room)
    alert = room_alert(room)
    for person in (owner, UserFactory(role='SUPERVISOR', cooperative=coop), UserFactory(role='ADMIN')):
        assert [a['id'] for a in listed(auth_client(person))] == [alert.pk]


def test_other_people_do_not_see_it(auth_client, farm, room):
    put(farm, room)
    room_alert(room)
    for person in (
        UserFactory(role='FARMER'),
        UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory()),
        UserFactory(role='SUPERVISOR'),
    ):
        assert listed(auth_client(person)) == []


def test_the_alerts_of_a_deleted_room_or_farm_are_hidden_from_everyone(auth_client, owner, farm, room):
    put(farm, room)
    room_alert(room)
    RearingRoom.objects.filter(pk=room.pk).update(is_active=False)
    assert listed(auth_client(UserFactory(role='ADMIN'))) == []
    assert listed(auth_client(owner)) == []


def test_a_farmer_marks_a_room_alert_read_and_unread_and_others_cannot(auth_client, owner, farm, room):
    put(farm, room)
    alert = room_alert(room)
    stranger = auth_client(UserFactory(role='FARMER'))
    assert stranger.patch(f'/api/alerts/{alert.pk}/read', {}, format='json').status_code == 404
    client = auth_client(owner)
    assert client.patch(f'/api/alerts/{alert.pk}/read', {}, format='json').status_code == 200
    assert AlertLog.objects.get(pk=alert.pk).is_read is True
    assert client.patch(f'/api/alerts/{alert.pk}/unread', {}, format='json').status_code == 200
    assert AlertLog.objects.get(pk=alert.pk).is_read is False


def test_mark_all_read_covers_room_alerts_in_scope_only(auth_client, coop, farm, room):
    put(farm, room)
    mine = room_alert(room)
    other_farm = FarmFactory(owner=UserFactory(role='FARMER'))
    other_room = RearingRoom.objects.create(farm=other_farm, name='Elsewhere')
    put(other_farm, other_room)
    theirs = room_alert(other_room)
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    assert auth_client(supervisor).post('/api/alerts/mark-all-read', {}, format='json').status_code == 200
    assert AlertLog.objects.get(pk=mine.pk).is_read is True
    assert AlertLog.objects.get(pk=theirs.pk).is_read is False


# ── the pages of a batch ────────────────────────────────────────────────────

def test_a_batch_shows_the_open_alerts_of_its_room(auth_client, owner, farm, room):
    batch = put(farm, room)
    alert = room_alert(room)
    data = auth_client(owner).get(f'/api/batches/{batch.pk}').json()['data']
    assert [a['id'] for a in data['alertLogs']] == [alert.pk]
    rows = auth_client(owner).get(f'/api/alerts/batch/{batch.pk}').json()['data']
    assert [a['id'] for a in rows] == [alert.pk]


def test_a_batch_does_not_show_the_alerts_of_a_room_it_was_never_in(auth_client, owner, farm, room):
    batch = put(farm, room)
    other = RearingRoom.objects.create(farm=farm, name='Rearing house 2')
    put(farm, other)
    room_alert(other)
    assert auth_client(owner).get(f'/api/alerts/batch/{batch.pk}').json()['data'] == []


def test_a_batch_has_the_alerts_of_a_room_only_for_the_time_it_was_there(auth_client, owner, farm, room):
    other = RearingRoom.objects.create(farm=farm, name='Rearing house 2')
    batch = put(farm, room, hours=48)
    before_arrival = room_alert(room)
    AlertLog.objects.filter(pk=before_arrival.pk).update(created_at=timezone.now() - timedelta(hours=72))
    during = room_alert(room)
    AlertLog.objects.filter(pk=during.pk).update(created_at=timezone.now() - timedelta(hours=30))
    place_batch(batch, other, when=timezone.now() - timedelta(hours=20))
    after_move = room_alert(room)
    AlertLog.objects.filter(pk=after_move.pk).update(created_at=timezone.now() - timedelta(hours=5))
    rows = auth_client(owner).get(f'/api/alerts/batch/{batch.pk}').json()['data']
    assert [a['id'] for a in rows] == [during.pk]


def test_the_alert_count_of_a_batch_matches_its_alerts(auth_client, owner, farm, room):
    batch = put(farm, room)
    AlertLog.objects.create(batch=batch, type='STAGE_CHANGE', message='Moved to Pupa')
    room_alert(room)
    room_alert(room, 'HUMIDITY')
    listed_batch = auth_client(owner).get(f'/api/batches/farm/{farm.pk}').json()['data'][0]
    assert listed_batch['counts']['alertLogs'] == 3
    assert len(auth_client(owner).get(f'/api/alerts/batch/{batch.pk}').json()['data']) == 3


def test_every_batch_in_a_room_counts_the_open_problem_of_the_room(auth_client, owner, farm, room):
    first, second = put(farm, room), put(farm, room)
    room_alert(room, 'TEMPERATURE')
    room_alert(room, 'HUMIDITY')
    resolved = room_alert(room, 'TEMPERATURE')
    AlertLog.objects.filter(pk=resolved.pk).update(resolved_at=timezone.now())
    room_alert(room, 'SYSTEM')
    rows = {r['id']: r for r in auth_client(owner).get('/api/batches/active').json()['data']}
    assert rows[first.pk]['openAlerts'] == 2
    assert rows[second.pk]['openAlerts'] == 2


def test_the_active_list_costs_the_same_however_many_room_alerts_there_are(auth_client, owner, farm):
    client = auth_client(owner)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            assert client.get('/api/batches/active').status_code == 200
        return len(captured)

    first = RearingRoom.objects.create(farm=farm, name='Room 0')
    put(farm, first)
    room_alert(first)
    few = queries()
    for index in range(1, 6):
        extra = RearingRoom.objects.create(farm=farm, name=f'Room {index}')
        put(farm, extra)
        put(farm, extra)
        room_alert(extra)
    assert queries() <= few + 1


# ── the live stream ─────────────────────────────────────────────────────────

def test_the_live_stream_says_which_room_an_alert_is_about(owner, farm, room):
    from alerts.sse_view import _payload
    put(farm, room)
    alert = room_alert(room)
    payload = _payload(alert)
    assert payload['roomId'] == room.pk and payload['batchId'] is None
