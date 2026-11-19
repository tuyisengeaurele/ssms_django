"""The page of one batch asks the database a fixed number of questions, however much the batch has.

It used to ask three questions for every alert (the batch, its farm and the farm's owner, one alert at a time), read the rooms the
batch had been in three times, and fetched every alert and detection once more for nothing. Each question is a round trip to a
database in another country. Each test builds a batch, counts the queries of one request, gives the batch more of something,
and counts again.
"""
import pytest

from alerts.models import AlertLog
from batches.placement import place_batch
from farms.models import RearingRoom
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    SensorReadingFactory,
    UserFactory,
)
from tests.query_growth import queries_for

pytestmark = pytest.mark.django_db

# Authentication, the batch with its farm, owner and room, its stays, detections, readings, alerts and the mortality total.
MOST_QUERIES = 9


@pytest.fixture
def owner():
    return UserFactory(role='FARMER')


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner)


@pytest.fixture
def batch(farm):
    batch = BatchFactory(farm=farm)
    place_batch(batch, RearingRoom.objects.create(farm=farm, name='First room'))
    return batch


def detail(client, batch):
    return queries_for(client, f'/api/batches/{batch.pk}')


def test_it_costs_the_same_with_more_alerts_of_the_batch(auth_client, owner, batch):
    client = auth_client(owner)
    AlertLogFactory(batch=batch)
    few = detail(client, batch)
    for _ in range(10):
        AlertLogFactory(batch=batch)
    assert detail(client, batch) == few


def test_it_costs_the_same_with_more_alerts_of_the_room(auth_client, owner, batch):
    client = auth_client(owner)
    AlertLog.objects.create(room=batch.room, type='TEMPERATURE', message='Too warm')
    few = detail(client, batch)
    for _ in range(10):
        AlertLog.objects.create(room=batch.room, type='HUMIDITY', message='Too damp')
    assert detail(client, batch) == few


def test_it_costs_the_same_with_more_rooms_the_batch_has_been_in(auth_client, owner, farm, batch):
    client = auth_client(owner)
    few = detail(client, batch)
    for number in range(4):
        place_batch(batch, RearingRoom.objects.create(farm=farm, name=f'Room {number}'))
    assert detail(client, batch) == few


def test_it_costs_the_same_with_more_detections_and_readings(auth_client, owner, batch):
    client = auth_client(owner)
    few = detail(client, batch)
    for _ in range(12):
        DiseaseDetectionFactory(batch=batch)
        SensorReadingFactory(batch=batch)
    assert detail(client, batch) == few


def test_it_stays_within_the_budget(auth_client, owner, batch):
    for _ in range(3):
        AlertLogFactory(batch=batch)
        DiseaseDetectionFactory(batch=batch)
    assert detail(auth_client(owner), batch) <= MOST_QUERIES


def test_it_still_says_everything_it_said_before(auth_client, owner, farm, batch):
    old_room = batch.room
    new_room = RearingRoom.objects.create(farm=farm, name='Second room')
    place_batch(batch, new_room)
    alert = AlertLogFactory(batch=batch)
    room_alert = AlertLog.objects.create(room=new_room, type='TEMPERATURE', message='Too warm')
    DiseaseDetectionFactory(batch=batch)

    data = auth_client(owner).get(f'/api/batches/{batch.pk}').json()['data']

    assert data['id'] == batch.pk
    assert data['farm']['id'] == farm.pk
    assert data['room'] == {'id': new_room.pk, 'name': 'Second room'}
    assert [stay['roomName'] for stay in data['roomStays']] == ['Second room', 'First room']
    assert data['roomStays'][0]['endedAt'] is None
    assert data['roomStays'][1]['endedAt'] is not None
    assert old_room.pk == data['roomStays'][1]['roomId']
    shown = {row['id']: row for row in data['alertLogs']}
    assert set(shown) == {alert.pk, room_alert.pk}
    assert shown[alert.pk]['farmerName'] == owner.name
    assert shown[room_alert.pk]['farmerName'] == owner.name
    assert shown[room_alert.pk]['batches'] == [{'id': batch.pk, 'stage': batch.stage}]
    assert len(data['diseaseDetections']) == 1
    assert data['mortalityTotal'] == 0
