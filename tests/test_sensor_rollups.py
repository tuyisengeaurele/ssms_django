"""Readings are summarised by the hour, so old ones can be removed and a long chart stays light.

One row for each room and each complete hour: how many readings, and the lowest, average and highest temperature and humidity. A reading
is removed only once its hour is summarised, and only after it is older than SENSOR_RAW_KEEP_DAYS (30). A batch's chart over more than a
week reads the summaries, plus the raw readings of the hours not summarised yet, so it is whole between two nightly runs. Readings from
before rooms existed know only their batch: they are not summarised, and the older cleanup removes them at 90 days.
"""
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from batches.compare import _conditions
from batches.models import BatchRoomStay
from farms.models import RearingRoom
from logs.models import JobLog
from sensors.models import SensorReading, SensorReadingHourly
from sensors.rollups import (
    delete_rolled_up,
    hour_floor,
    prune_raw,
    roll_up,
    rolled_through,
    rollups_for_batch,
    split_point,
)
from sensors.series import batch_series
from tests.factories import BatchFactory, FarmFactory, SensorReadingFactory

pytestmark = pytest.mark.django_db

NOW = hour_floor(timezone.now()) + timedelta(minutes=20)


def room_in(farm=None, name='Room A'):
    return RearingRoom.objects.create(farm=farm or FarmFactory(), name=name)


def reading(room, hours_ago, temperature=25.0, humidity=78.0, minute=0, batch=None):
    """A reading `hours_ago` whole hours before this hour, at `minute` past it."""
    row = SensorReadingFactory(batch=batch, room=room, temperature=temperature, humidity=humidity)
    SensorReading.objects.filter(pk=row.pk).update(timestamp=hour_floor(NOW) - timedelta(hours=hours_ago) + timedelta(minutes=minute))
    return row


def stay(batch, room, hours_ago_start, hours_ago_end=None):
    return BatchRoomStay.objects.create(
        batch=batch, room=room, started_at=hour_floor(NOW) - timedelta(hours=hours_ago_start),
        ended_at=None if hours_ago_end is None else hour_floor(NOW) - timedelta(hours=hours_ago_end),
    )


def summary(room, hours_ago):
    return SensorReadingHourly.objects.get(room=room, hour=hour_floor(NOW) - timedelta(hours=hours_ago))


# ── writing the summaries ───────────────────────────────────────────────────────────────────

def test_an_hour_is_summarised_as_count_lowest_average_and_highest():
    room = room_in()
    for minute, (temp, hum) in zip((5, 25, 45), ((20.0, 70.0), (24.0, 80.0), (28.0, 90.0))):
        reading(room, 3, temp, hum, minute)
    roll_up(now=NOW)
    row = summary(room, 3)
    assert row.count == 3
    assert (row.temp_min, row.temp_avg, row.temp_max) == (20.0, 24.0, 28.0)
    assert (row.hum_min, row.hum_avg, row.hum_max) == (70.0, 80.0, 90.0)


def test_each_room_and_each_hour_has_its_own_row():
    a, b = room_in(name='A'), room_in(name='B')
    reading(a, 2), reading(a, 3), reading(b, 2)
    roll_up(now=NOW)
    assert SensorReadingHourly.objects.count() == 3


def test_the_hour_that_is_not_over_yet_is_left_for_later():
    room = room_in()
    reading(room, 0, minute=5)      # this hour
    reading(room, 1)
    roll_up(now=NOW)
    assert list(SensorReadingHourly.objects.values_list('hour', flat=True)) == [hour_floor(NOW) - timedelta(hours=1)]


def test_readings_with_no_room_are_not_summarised():
    batch = BatchFactory()
    reading(None, 3, batch=batch)
    assert roll_up(now=NOW) == 0
    assert not SensorReadingHourly.objects.exists()


def test_running_it_again_changes_nothing_and_a_changed_hour_is_written_again():
    room = room_in()
    first = reading(room, 3, 20.0)
    roll_up(now=NOW)
    roll_up(now=NOW)
    assert SensorReadingHourly.objects.count() == 1
    reading(room, 3, 30.0, minute=30)
    roll_up(now=NOW, since=hour_floor(NOW) - timedelta(hours=4))
    row = summary(room, 3)
    assert (row.count, row.temp_avg) == (2, 25.0)
    assert first.pk


def test_it_says_how_many_rows_it_wrote():
    room = room_in()
    reading(room, 2), reading(room, 3)
    assert roll_up(now=NOW) == 2


def test_the_first_run_starts_at_the_oldest_reading_and_covers_many_days_in_passes():
    room = room_in()
    reading(room, 24 * 9), reading(room, 24 * 5 + 7), reading(room, 2)
    assert roll_up(now=NOW, days_per_pass=2) == 3
    assert SensorReadingHourly.objects.count() == 3


def test_a_later_run_picks_up_where_the_last_one_ended():
    room = room_in()
    reading(room, 30)
    roll_up(now=NOW)
    reading(room, 5)
    assert roll_up(now=NOW) >= 1
    assert rolled_through() == hour_floor(NOW) - timedelta(hours=4)    # the hour after the newest summary


def test_rolled_through_is_none_before_any_summary_and_the_hour_after_the_newest_after():
    assert rolled_through() is None
    room = room_in()
    reading(room, 4)
    roll_up(now=NOW)
    assert rolled_through() == hour_floor(NOW) - timedelta(hours=3)


# ── removing raw readings ───────────────────────────────────────────────────────────────────

def test_a_reading_is_removed_only_once_its_hour_is_summarised(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 2
    room = room_in()
    summarised = reading(room, 24 * 3)
    not_summarised = reading(room, 24 * 3 + 1)
    SensorReadingHourly.objects.create(
        room=room, hour=hour_floor(NOW) - timedelta(hours=24 * 3), count=1, temp_min=25, temp_avg=25, temp_max=25, hum_min=78, hum_avg=78, hum_max=78,
    )
    assert delete_rolled_up(now=NOW) == 1
    assert not SensorReading.objects.filter(pk=summarised.pk).exists()
    assert SensorReading.objects.filter(pk=not_summarised.pk).exists()


def test_readings_inside_the_keeping_time_stay(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 5
    room = room_in()
    recent = reading(room, 24 * 3)
    roll_up(now=NOW)
    assert delete_rolled_up(now=NOW) == 0
    assert SensorReading.objects.filter(pk=recent.pk).exists()


def test_pruning_summarises_first_and_then_removes(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 2
    room = room_in()
    old = [reading(room, 24 * 4 + h, 20.0 + h) for h in range(3)]
    kept = reading(room, 5)
    removed = prune_raw(now=NOW)
    assert removed == 3
    assert SensorReadingHourly.objects.filter(room=room).count() == 3   # the three old hours; the recent one is for the next roll up
    assert SensorReading.objects.filter(pk=kept.pk).exists()
    assert not SensorReading.objects.filter(pk__in=[r.pk for r in old]).exists()


def test_a_reading_with_no_room_is_not_removed_by_pruning(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 2
    legacy = reading(None, 24 * 5, batch=BatchFactory())
    prune_raw(now=NOW)
    assert SensorReading.objects.filter(pk=legacy.pk).exists()


def test_removal_goes_in_small_steps(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 1
    room = room_in()
    for h in range(7):
        reading(room, 24 * 3 + h)
    assert prune_raw(now=NOW, step=2) == 7
    assert not SensorReading.objects.exists()


# ── the cleanup that was there before ───────────────────────────────────────────────────────

def test_the_older_cleanup_now_removes_only_readings_that_cannot_be_summarised():
    room = room_in()
    batch = BatchFactory()
    in_a_room = reading(room, 24 * 100)
    before_rooms = reading(None, 24 * 100, batch=batch)
    call_command('cleanup_sensor_readings', '--days', '90', verbosity=0)
    assert SensorReading.objects.filter(pk=in_a_room.pk).exists()      # not summarised yet, so not removed
    assert not SensorReading.objects.filter(pk=before_rooms.pk).exists()


def test_the_nightly_command_summarises_removes_and_writes_to_the_job_log(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 2
    room = room_in()
    reading(room, 24 * 4)
    reading(room, 5)
    call_command('rollup_readings', verbosity=0)
    assert SensorReadingHourly.objects.count() == 2
    assert SensorReading.objects.count() == 1
    kinds = list(JobLog.objects.filter(subject='rollup_readings').values_list('kind', flat=True))
    assert 'command_started' in kinds and 'command_finished' in kinds


def test_a_dry_run_changes_nothing(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 2
    room = room_in()
    reading(room, 24 * 4)
    call_command('rollup_readings', '--dry-run', verbosity=0)
    assert not SensorReadingHourly.objects.exists() and SensorReading.objects.count() == 1


# ── the chart ───────────────────────────────────────────────────────────────────────────────

def a_batch_that_moved():
    """Eight days of hourly readings, in a batch that stayed ten days: room A for the first six, then room B."""
    batch = BatchFactory()
    a, b = room_in(batch.farm, 'A'), room_in(batch.farm, 'B')
    stay(batch, a, 24 * 10, 24 * 4)
    stay(batch, b, 24 * 4)
    for h in range(1, 24 * 8):
        in_a = h > 24 * 4
        reading(a if in_a else b, h, 20.0 + (h % 7), 70.0 + (h % 11))
        # the room the batch is not in has readings too, which are not the batch's
        reading(b if in_a else a, h, 80.0, 80.0)
    return batch, a, b


def comparable(points):
    return [(p['timestamp'], p['temperature'], p['humidity'], p['count']) for p in points]


def test_a_month_chart_from_the_summaries_is_the_same_chart_as_from_the_raw_readings():
    batch, _, _ = a_batch_that_moved()
    before = batch_series(batch, 24 * 9)
    roll_up(now=NOW)
    after = batch_series(batch, 24 * 9)
    assert before and comparable(after) == comparable(before)


def test_the_chart_is_the_same_once_the_raw_readings_are_gone(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 2
    batch, _, _ = a_batch_that_moved()
    before = batch_series(batch, 24 * 9)
    prune_raw(now=NOW)
    assert SensorReading.objects.count() < 24 * 20
    assert comparable(batch_series(batch, 24 * 9)) == comparable(before)


def test_the_hours_not_summarised_yet_come_from_the_raw_readings():
    room = room_in()
    batch = BatchFactory(farm=room.farm)
    stay(batch, room, 24 * 10)
    reading(room, 24 * 8, 20.0)
    reading(room, 24 * 3, 22.0)
    roll_up(now=NOW - timedelta(hours=24 * 5))        # the job last ran five days ago
    reading(room, 2, 30.0)                            # an hour since then, so only the raw reading has it
    series = batch_series(batch, 24 * 9)
    assert any(p['temperature'] == 30.0 for p in series)
    assert any(p['temperature'] == 22.0 for p in series)


def test_readings_from_before_rooms_still_show_in_a_long_chart():
    batch = BatchFactory()
    reading(None, 24 * 3, 27.0, batch=batch)
    roll_up(now=NOW)
    assert [p['temperature'] for p in batch_series(batch, 24 * 9)] == [27.0]


def test_a_chart_of_a_week_or_less_still_reads_the_raw_readings():
    room = room_in()
    batch = BatchFactory(farm=room.farm)
    stay(batch, room, 24 * 3)
    reading(room, 5, 26.0)
    # no summaries at all: only the raw path can answer
    assert [p['temperature'] for p in batch_series(batch, 24 * 7)] == [26.0]


def test_the_summaries_of_a_batch_are_those_of_the_rooms_it_stayed_in_and_when():
    batch, a, b = a_batch_that_moved()
    roll_up(now=NOW)
    rows = rollups_for_batch(batch)
    assert set(rows.values_list('room_id', flat=True)) == {a.pk, b.pk}
    assert not rows.filter(temp_avg=80.0).exists()


# ── how a batch compares ────────────────────────────────────────────────────────────────────

def test_the_share_in_range_covers_the_whole_life_of_a_batch_after_old_readings_are_removed(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 2
    room = room_in()
    batch = BatchFactory(farm=room.farm, stage='LARVA')
    stay(batch, room, 24 * 10)
    for h in range(1, 24 * 8):
        inside = h % 4 != 0
        reading(room, h, 25.0 if inside else 40.0, 78.0)
    before = _conditions(batch, {}, split_point())
    prune_raw(now=NOW)
    after = _conditions(batch, {}, split_point())
    assert after == before


# ── the table ───────────────────────────────────────────────────────────────────────────────

def test_the_table_refuses_two_rows_for_the_same_room_and_hour():
    room = room_in()
    fields = dict(room=room, hour=hour_floor(NOW), count=1, temp_min=1, temp_avg=1, temp_max=1, hum_min=1, hum_avg=1, hum_max=1)
    SensorReadingHourly.objects.create(**fields)
    with pytest.raises(IntegrityError), transaction.atomic():
        SensorReadingHourly.objects.create(**fields)


def test_the_batch_and_time_index_exists():
    with connection.cursor() as cursor:
        constraints = connection.introspection.get_constraints(cursor, 'sensor_readings')
    index = constraints.get('sensor_batch_time_idx')
    assert index is not None and index['columns'] == ['batchId', 'timestamp']


@pytest.mark.django_db(transaction=True)
def test_the_migrations_apply_and_reverse():
    def tables():
        return set(connection.introspection.table_names())

    try:
        call_command('migrate', 'sensors', '0006', verbosity=0)
        assert 'sensor_readings_hourly' not in tables()
    finally:
        call_command('migrate', verbosity=0)
    assert 'sensor_readings_hourly' in tables()


def test_since_summarises_again_from_a_day_for_readings_that_were_added_late(settings):
    settings.SENSOR_RAW_KEEP_DAYS = 400
    room = room_in()
    reading(room, 24 * 6)
    reading(room, 3)
    call_command('rollup_readings', verbosity=0)
    late = reading(room, 24 * 5)            # an hour that is already behind the newest summary
    call_command('rollup_readings', verbosity=0)
    assert not SensorReadingHourly.objects.filter(room=room, hour=hour_floor(NOW) - timedelta(hours=24 * 5)).exists()
    day = (hour_floor(NOW) - timedelta(days=6)).strftime('%Y-%m-%d')
    call_command('rollup_readings', '--since', day, verbosity=0)
    assert SensorReadingHourly.objects.filter(room=room, hour=hour_floor(NOW) - timedelta(hours=24 * 5)).exists()
    assert late.pk


def test_a_chart_of_many_readings_an_hour_has_the_same_counts_and_the_same_values_to_the_rounding():
    room = room_in()
    batch = BatchFactory(farm=room.farm)
    stay(batch, room, 24 * 12)
    for h in range(30, 24 * 8):
        for minute in range(0, 60, 5):
            reading(room, h, 24.0 + ((h * 7 + minute) % 37) / 9.3, 75.0 + ((h * 3 + minute) % 41) / 7.7, minute)
    before = batch_series(batch, 24 * 9)
    roll_up(now=NOW)
    after = batch_series(batch, 24 * 9)
    assert [p['timestamp'] for p in after] == [p['timestamp'] for p in before]
    assert [p['count'] for p in after] == [p['count'] for p in before]
    for new, old in zip(after, before):
        assert abs(new['temperature'] - old['temperature']) <= 0.1 and abs(new['humidity'] - old['humidity']) <= 0.1


@pytest.mark.usefixtures('naive_reading_times')
class TestOlderDatabase:
    """A database built before Django keeps the reading times without a time zone. The nightly job must still run on it."""

    def test_the_hours_are_summarised(self):
        room = room_in()
        reading(room, 3, 20.0), reading(room, 3, 30.0, minute=30)
        assert roll_up(now=NOW) == 1
        row = summary(room, 3)
        assert (row.count, row.temp_avg) == (2, 25.0)

    def test_the_first_run_finds_the_oldest_reading_and_covers_the_days_before_it(self):
        room = room_in()
        reading(room, 24 * 9), reading(room, 2)
        assert roll_up(now=NOW, days_per_pass=2) == 2

    def test_old_readings_are_summarised_then_removed(self, settings):
        settings.SENSOR_RAW_KEEP_DAYS = 2
        room = room_in()
        old = reading(room, 24 * 4)
        kept = reading(room, 5)
        assert prune_raw(now=NOW) == 1
        assert not SensorReading.objects.filter(pk=old.pk).exists()
        assert SensorReading.objects.filter(pk=kept.pk).exists()
        assert summary(room, 24 * 4).count == 1

    def test_the_nightly_command_runs(self, settings):
        settings.SENSOR_RAW_KEEP_DAYS = 2
        room = room_in()
        reading(room, 24 * 4)
        call_command('rollup_readings', verbosity=0)
        assert SensorReadingHourly.objects.count() == 1 and not SensorReading.objects.exists()

    def test_a_long_chart_reads_the_summaries_and_the_raw_readings_together(self, settings):
        settings.SENSOR_RAW_KEEP_DAYS = 2
        room = room_in()
        batch = BatchFactory(farm=room.farm)
        stay(batch, room, 24 * 10)
        reading(room, 24 * 5, 22.0)
        reading(room, 3, 28.0)
        before = batch_series(batch, 24 * 9)
        prune_raw(now=NOW)
        after = batch_series(batch, 24 * 9)
        assert [(p['temperature'], p['count']) for p in after] == [(p['temperature'], p['count']) for p in before]
