"""The screens read readings by room: a batch sees what its rooms measured while it was there."""
from datetime import timedelta
from unittest import mock

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from alerts.models import AlertLog
from batches.placement import place_batch
from farms.models import RearingRoom
from sensors.models import SensorReading
from tests.factories import BatchFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _no_email():
    with mock.patch('alerts.utils._send_mail_async'):
        yield


@pytest.fixture
def owner():
    return UserFactory(role='FARMER')


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner)


def ago(hours):
    return timezone.now() - timedelta(hours=hours)


def make_room(farm, name='Room A'):
    return RearingRoom.objects.create(farm=farm, name=name)


def put(farm, room, hours=48, **kw):
    batch = BatchFactory(farm=farm, **kw)
    place_batch(batch, room, when=ago(hours))
    return batch


def reading(room, hours_ago, temperature=25.0, humidity=78.0):
    row = SensorReading.objects.create(room=room, temperature=temperature, humidity=humidity)
    SensorReading.objects.filter(pk=row.pk).update(timestamp=ago(hours_ago))
    return row


# ── typing a reading in by hand ─────────────────────────────────────────────

def test_a_typed_reading_goes_to_the_room_of_the_batch_not_to_the_batch(auth_client, owner, farm):
    room = make_room(farm)
    batch = put(farm, room)
    response = auth_client(owner).post('/api/sensors', {'batchId': batch.pk, 'temperature': 24.5, 'humidity': 77.0}, format='json')
    assert response.status_code == 201
    row = SensorReading.objects.get()
    assert (row.room_id, row.batch_id, row.temperature) == (room.pk, None, 24.5)
    assert response.json()['data']['roomId'] == room.pk


def test_every_batch_in_the_room_shares_a_typed_reading(auth_client, owner, farm):
    room = make_room(farm)
    first, second = put(farm, room), put(farm, room)
    auth_client(owner).post('/api/sensors', {'batchId': first.pk, 'temperature': 24.5, 'humidity': 77.0}, format='json')
    client = auth_client(owner)
    for batch in (first, second):
        rows = client.get(f'/api/sensors/batch/{batch.pk}').json()['data']
        assert [r['temperature'] for r in rows] == [24.5]


def test_a_bad_typed_reading_opens_one_alert_for_the_room(auth_client, owner, farm):
    room = make_room(farm)
    put(farm, room)
    first = put(farm, room)
    auth_client(owner).post('/api/sensors', {'batchId': first.pk, 'temperature': 19.0, 'humidity': 77.0}, format='json')
    assert AlertLog.objects.filter(room=room, type='TEMPERATURE').count() == 1
    assert AlertLog.objects.count() == 1


def test_a_batch_that_was_never_placed_still_takes_a_typed_reading_of_its_own(auth_client, owner, farm):
    batch = BatchFactory(farm=farm)
    assert auth_client(owner).post('/api/sensors', {'batchId': batch.pk, 'temperature': 24.5, 'humidity': 77.0}, format='json').status_code == 201
    row = SensorReading.objects.get()
    assert (row.batch_id, row.room_id) == (batch.pk, None)
    assert len(auth_client(owner).get(f'/api/sensors/batch/{batch.pk}').json()['data']) == 1


# ── the pages of a batch ────────────────────────────────────────────────────

def test_the_readings_of_a_batch_follow_it_from_room_to_room(auth_client, owner, farm):
    a, b = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    batch = put(farm, a, hours=30)
    reading(a, 25, temperature=21.0)
    reading(b, 25, temperature=29.0)
    place_batch(batch, b, when=ago(20))
    reading(a, 10, temperature=23.0)
    reading(b, 10, temperature=26.0)
    client = auth_client(owner)
    temps = sorted(r['temperature'] for r in client.get(f'/api/sensors/batch/{batch.pk}').json()['data'])
    assert temps == [21.0, 26.0]


def test_the_series_uses_the_same_readings(auth_client, owner, farm):
    a, b = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    batch = put(farm, a, hours=30)
    reading(a, 25, temperature=21.0)
    place_batch(batch, b, when=ago(20))
    reading(a, 10, temperature=23.0)
    reading(b, 10, temperature=26.0)
    rows = auth_client(owner).get(f'/api/sensors/batch/{batch.pk}/series?hours=48').json()['data']
    assert sorted(r['temperature'] for r in rows) == [21.0, 26.0]


def test_the_batch_page_carries_its_readings_and_their_count(auth_client, owner, farm):
    room = make_room(farm)
    batch = put(farm, room)
    for hours_ago in (3, 2, 1):
        reading(room, hours_ago)
    data = auth_client(owner).get(f'/api/batches/{batch.pk}').json()['data']
    assert len(data['sensorReadings']) == 3
    listed = auth_client(owner).get(f'/api/batches/farm/{farm.pk}').json()['data'][0]
    assert listed['counts']['sensorReadings'] == 3


def test_the_active_list_gives_every_batch_in_a_room_the_rooms_latest_reading(auth_client, owner, farm):
    room = make_room(farm)
    first, second = put(farm, room), put(farm, room)
    reading(room, 5, temperature=20.0)
    reading(room, 1, temperature=26.5)
    rows = {r['id']: r for r in auth_client(owner).get('/api/batches/active').json()['data']}
    assert rows[first.pk]['latestReading']['temperature'] == 26.5
    assert rows[second.pk]['latestReading']['temperature'] == 26.5


def test_a_batch_does_not_get_the_reading_of_a_room_it_was_never_in(auth_client, owner, farm):
    a, b = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    batch = put(farm, a)
    reading(b, 1)
    row = {r['id']: r for r in auth_client(owner).get('/api/batches/active').json()['data']}[batch.pk]
    assert row['latestReading'] is None


# ── the charts ──────────────────────────────────────────────────────────────

def test_the_chart_counts_a_room_once_however_many_batches_are_in_it(auth_client, owner, farm):
    a, b = make_room(farm, 'Room A'), make_room(farm, 'Room B')
    put(farm, a)
    put(farm, a)
    put(farm, a)
    put(farm, b)
    now = timezone.now().replace(minute=15, second=0, microsecond=0)
    for room_, temperature in ((a, 24.0), (b, 28.0)):
        row = SensorReading.objects.create(room=room_, temperature=temperature, humidity=75.0)
        SensorReading.objects.filter(pk=row.pk).update(timestamp=now - timedelta(hours=2))
    data = auth_client(owner).get('/api/sensors/chart?hours=24').json()['data']
    assert [row['avgTemp'] for row in data] == [26.0]


def test_the_chart_leaves_out_other_farmers_rooms(auth_client, owner, farm):
    mine = make_room(farm)
    reading(mine, 2, temperature=24.0)
    reading(make_room(FarmFactory(), 'Not mine'), 2, temperature=40.0)
    assert [r['avgTemp'] for r in auth_client(owner).get('/api/sensors/chart?hours=24').json()['data']] == [24.0]


# ── cost ────────────────────────────────────────────────────────────────────

def test_the_active_list_costs_the_same_however_many_batches_and_rooms_there_are(auth_client, owner, farm):
    client = auth_client(owner)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            assert client.get('/api/batches/active').status_code == 200
        return len(captured)

    room = make_room(farm, 'Room 0')
    put(farm, room)
    reading(room, 1)
    few = queries()
    for index in range(1, 6):
        extra = make_room(farm, f'Room {index}')
        put(farm, extra)
        put(farm, extra)
        reading(extra, 1)
    assert queries() <= few + 1
