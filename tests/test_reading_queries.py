"""How many readings a batch has, and its newest one, worked out for a whole list of batches in the database.

A batch's readings are those of the rooms it stayed in, while it stayed there (sensors/room_readings.py). For a list this used to be
written as a test run against every reading in the table, which no index can help: one batch's count took 2.4 seconds with 288,000
readings. It is now a join from the batch's stays to the readings of that room, which the room and time index answers.

`readings_for_batch` is the rule, written once as a plain filter for one batch. Everything here has to agree with it.
"""
from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone

from alerts.models import AlertLog
from alerts.room_alerts import alert_count, alerts_for_batch
from batches.models import Batch
from batches.placement import leave_room, place_batch
from farms.models import RearingRoom
from sensors.models import SensorReading
from sensors.room_readings import newest_reading, reading_count, readings_for_batch
from tests.factories import BatchFactory, FarmFactory

pytestmark = pytest.mark.django_db

NOW = timezone.now().replace(microsecond=0)


def ago(hours):
    return NOW - timedelta(hours=hours)


def put(room, hours_ago, temperature=25.0, humidity=78.0, **extra):
    row = SensorReading.objects.create(room=room, temperature=temperature, humidity=humidity, **extra)
    SensorReading.objects.filter(pk=row.pk).update(timestamp=ago(hours_ago))
    return row


def legacy(batch, hours_ago, temperature=21.0):
    """A reading from before rooms existed: it knows its batch and no room."""
    row = SensorReading.objects.create(batch=batch, temperature=temperature, humidity=70.0)
    SensorReading.objects.filter(pk=row.pk).update(timestamp=ago(hours_ago))
    return row


@pytest.fixture
def world():
    """Batches in the situations the rule has to get right. Returns {name: batch}."""
    farm = FarmFactory()
    one = RearingRoom.objects.create(farm=farm, name='Room one')
    two = RearingRoom.objects.create(farm=farm, name='Room two')
    for hours in (40, 25, 14, 12, 9, 6, 3, 1):
        put(one, hours, temperature=20 + hours / 10)
        put(two, hours + 0.5, temperature=30 + hours / 10)

    made = {}
    # Nothing yet: no stay, no reading.
    made['empty'] = BatchFactory(farm=farm)
    # Only readings that know their batch and no room.
    made['legacy'] = BatchFactory(farm=farm)
    for hours in (30, 20, 10):
        legacy(made['legacy'], hours)
    # In one room, still there.
    made['open'] = BatchFactory(farm=farm)
    place_batch(made['open'], one, when=ago(13))
    # Shares that room with it.
    made['neighbour'] = BatchFactory(farm=farm)
    place_batch(made['neighbour'], one, when=ago(20))
    # Moved from one room to the other, with a reading at the exact moment of the move (it belongs to the new room).
    made['moved'] = BatchFactory(farm=farm)
    place_batch(made['moved'], one, when=ago(30))
    put(one, 12)
    put(two, 12)
    place_batch(made['moved'], two, when=ago(12))
    # Back to a room it had been in before.
    made['returned'] = BatchFactory(farm=farm)
    place_batch(made['returned'], one, when=ago(45))
    place_batch(made['returned'], two, when=ago(20))
    place_batch(made['returned'], one, when=ago(8))
    # Left every room (for example harvested): its stays are all closed.
    made['left'] = BatchFactory(farm=farm)
    place_batch(made['left'], one, when=ago(26))
    leave_room(made['left'], when=ago(5))
    # A room stay and old readings that know the batch, the legacy ones newer than anything in the room.
    made['both'] = BatchFactory(farm=farm)
    place_batch(made['both'], two, when=ago(10))
    legacy(made['both'], 0.2, temperature=19.5)
    # A stay in a room that has no readings.
    made['quiet'] = BatchFactory(farm=farm)
    place_batch(made['quiet'], RearingRoom.objects.create(farm=farm, name='Quiet room'), when=ago(10))
    return made


def annotated(world):
    qs = Batch.objects.filter(pk__in=[b.pk for b in world.values()]).annotate(reading_total=reading_count(), **newest_reading())
    return {row.pk: row for row in qs}


def test_the_count_is_the_rule_for_every_batch(world):
    rows = annotated(world)
    for name, batch in world.items():
        assert rows[batch.pk].reading_total == readings_for_batch(batch).count(), name


def test_there_is_something_to_count(world):
    # The scenarios would prove nothing if they were all empty.
    counts = {name: readings_for_batch(batch).count() for name, batch in world.items()}
    assert counts['empty'] == 0 and counts['quiet'] == 0
    assert counts['legacy'] == 3 and counts['open'] > 0 and counts['moved'] > 0 and counts['returned'] > 0 and counts['both'] > 1


def test_the_newest_reading_is_the_rule_for_every_batch(world):
    rows = annotated(world)
    for name, batch in world.items():
        newest = readings_for_batch(batch).order_by('-timestamp').first()
        row = rows[batch.pk]
        if newest is None:
            assert (row.latest_temperature, row.latest_humidity, row.latest_reading_at) == (None, None, None), name
        else:
            assert row.latest_temperature == newest.temperature, name
            assert row.latest_humidity == newest.humidity, name
            assert row.latest_reading_at == newest.timestamp, name


def test_a_legacy_reading_newer_than_the_room_readings_is_the_newest(world):
    row = annotated(world)[world['both'].pk]
    assert row.latest_temperature == 19.5
    assert row.latest_reading_at == ago(0.2)


def test_a_reading_at_the_moment_of_a_move_belongs_to_the_new_room(world):
    row = annotated(world)[world['moved'].pk]
    moved = readings_for_batch(world['moved'])
    assert row.reading_total == moved.count()
    assert moved.filter(timestamp=ago(12), room__name='Room two').exists()
    assert not moved.filter(timestamp=ago(12), room__name='Room one').exists()


def plan(queryset):
    """The database's own plan for a queryset, with sequential scans made as unattractive as the planner allows."""
    sql, params = queryset.query.sql_with_params()
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL enable_seqscan = off')
        cursor.execute('EXPLAIN ' + sql, params)
        return '\n'.join(row[0] for row in cursor.fetchall())


def test_the_count_does_not_have_to_read_every_reading(world):
    text = plan(Batch.objects.annotate(reading_total=reading_count()).values('reading_total'))
    # A test run against every reading, which is what this used to be, can only be answered by reading the whole table, even when
    # the planner is told to avoid that. The stay-driven form finds the readings through an index.
    assert 'Seq Scan on sensor_readings' not in text, text


def test_the_newest_reading_does_not_have_to_read_every_reading(world):
    text = plan(Batch.objects.annotate(**newest_reading()).values('latest_reading_at'))
    assert 'Seq Scan on sensor_readings' not in text, text


def test_the_alert_count_is_the_rule_for_every_batch(world):
    one = RearingRoom.objects.filter(name='Room one').first()
    two = RearingRoom.objects.filter(name='Room two').first()
    for room, hours in ((one, 40), (one, 25), (one, 12), (one, 7), (two, 18), (two, 9), (two, 2)):
        alert = AlertLog.objects.create(room=room, type='TEMPERATURE', message='x')
        AlertLog.objects.filter(pk=alert.pk).update(created_at=ago(hours))
    for batch in world.values():
        AlertLog.objects.create(batch=batch, type='STAGE_CHANGE', message='x')
    rows = {row.pk: row for row in Batch.objects.filter(pk__in=[b.pk for b in world.values()]).annotate(total=alert_count())}
    for name, batch in world.items():
        assert rows[batch.pk].total == alerts_for_batch(batch).count(), name


def test_the_alert_count_by_type_is_the_rule(world):
    one = RearingRoom.objects.filter(name='Room one').first()
    for hours, kind in ((12, 'TEMPERATURE'), (7, 'HUMIDITY'), (3, 'TEMPERATURE')):
        alert = AlertLog.objects.create(room=one, type=kind, message='x')
        AlertLog.objects.filter(pk=alert.pk).update(created_at=ago(hours))
    rows = {row.pk: row for row in Batch.objects.filter(pk__in=[b.pk for b in world.values()]).annotate(total=alert_count(['TEMPERATURE']))}
    for name, batch in world.items():
        assert rows[batch.pk].total == alerts_for_batch(batch).filter(type='TEMPERATURE').count(), name
