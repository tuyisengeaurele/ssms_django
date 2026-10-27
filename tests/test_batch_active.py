"""The active batches list also tells the dashboard each batch's latest reading and how many problems are open."""
from datetime import timedelta

import pytest
from django.utils import timezone

from alerts.models import AlertLog
from sensors.models import SensorReading
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    SensorReadingFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def active_for(auth_client, owner):
    rows = auth_client(owner).get('/api/batches/active').json()['data']
    return {row['id']: row for row in rows}


@pytest.fixture
def owner():
    return UserFactory(role='FARMER')


@pytest.fixture
def batch(owner):
    return BatchFactory(farm=FarmFactory(owner=owner))


def reading(batch, temperature, humidity, minutes_ago):
    row = SensorReadingFactory(batch=batch, temperature=temperature, humidity=humidity)
    SensorReading.objects.filter(pk=row.pk).update(timestamp=timezone.now() - timedelta(minutes=minutes_ago))
    return row


def test_a_batch_without_readings_has_no_latest_reading(auth_client, owner, batch):
    row = active_for(auth_client, owner)[batch.pk]
    assert row['latestReading'] is None
    assert row['openAlerts'] == 0


def test_the_latest_reading_is_the_newest_one(auth_client, owner, batch):
    reading(batch, 20.0, 60.0, minutes_ago=300)
    reading(batch, 24.5, 78.5, minutes_ago=10)
    reading(batch, 23.0, 75.0, minutes_ago=120)
    latest = active_for(auth_client, owner)[batch.pk]['latestReading']
    assert (latest['temperature'], latest['humidity']) == (24.5, 78.5)
    assert latest['timestamp']


def test_each_batch_gets_its_own_latest_reading(auth_client, owner):
    farm = FarmFactory(owner=owner)
    first, second = BatchFactory(farm=farm), BatchFactory(farm=farm)
    reading(first, 21.0, 70.0, 5)
    reading(second, 26.0, 80.0, 5)
    rows = active_for(auth_client, owner)
    assert rows[first.pk]['latestReading']['temperature'] == 21.0
    assert rows[second.pk]['latestReading']['temperature'] == 26.0


def test_open_alerts_count_only_unresolved_temperature_and_humidity_problems(auth_client, owner, batch):
    AlertLogFactory(batch=batch, type='TEMPERATURE')
    AlertLogFactory(batch=batch, type='HUMIDITY')
    resolved = AlertLogFactory(batch=batch, type='TEMPERATURE')
    AlertLog.objects.filter(pk=resolved.pk).update(resolved_at=timezone.now())
    AlertLogFactory(batch=batch, type='STAGE_CHANGE')
    AlertLogFactory(batch=batch, type='DISEASE')
    assert active_for(auth_client, owner)[batch.pk]['openAlerts'] == 2


def test_counts_stay_right_when_a_batch_has_many_alerts_and_many_checks(auth_client, owner, batch):
    for _ in range(3):
        AlertLogFactory(batch=batch, type='TEMPERATURE')
        DiseaseDetectionFactory(batch=batch)
    row = active_for(auth_client, owner)[batch.pk]
    assert row['openAlerts'] == 3
    assert row['detectionCount'] == 3
