"""Readings summarised by the hour, and the removal of the raw readings that have been summarised.

A summary is one row for a room and a complete hour (SensorReadingHourly): how many readings and the lowest, average and highest of
each measure. The rules:

- Only complete hours are summarised. The hour that is not over is left until it is.
- Writing is an upsert, so running it again, or over an hour that changed, is safe.
- A raw reading is removed only when it is older than SENSOR_RAW_KEEP_DAYS and its hour has a summary. The keeping time is counted
  in whole hours, so an hour is never half removed and a later run cannot write a summary from half of it.
- Readings with no room (from before rooms) cannot be summarised. They stay until the older cleanup removes them.
- A summary no longer knows the minute, so the edges are approximate: an hour in which a batch moved counts whole for the room it left,
  and the first partial hour of a chart counts whole. A chart from summaries has the same counts and values as one from raw readings
  everywhere else, to the rounding of a decimal.
"""
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

from django.conf import settings
from django.db.models import Avg, Count, Exists, Max, Min, OuterRef, Q
from django.db.models.functions import TruncHour
from django.utils import timezone

from batches.models import BatchRoomStay

from .models import SensorReading, SensorReadingHourly

HOUR = timedelta(hours=1)
# A later run goes back this far over what it already wrote, in case a reading was saved late.
OVERLAP = timedelta(hours=2)
_UTC = dt_timezone.utc


def hour_floor(moment: datetime) -> datetime:
    return moment.replace(minute=0, second=0, microsecond=0)


def raw_cutoff(now: datetime | None = None) -> datetime:
    """Raw readings older than this are no longer kept. Whole hours, so an hour is kept or removed as a whole."""
    return hour_floor((now or timezone.now()) - timedelta(days=settings.SENSOR_RAW_KEEP_DAYS))


def rolled_through() -> datetime | None:
    """The hour after the newest summary: every raw reading from here on has no summary yet. None before the first summary."""
    newest = SensorReadingHourly.objects.aggregate(newest=Max('hour'))['newest']
    return newest + HOUR if newest else None


def split_point(now: datetime | None = None) -> datetime | None:
    """Where to stop reading raw readings and start reading summaries, for a figure that must cover a whole batch.

    Raw readings from here on, summaries before it. It is never later than what has been summarised, so a night the job did not run
    cannot lose an hour. None when nothing is summarised yet: read the raw readings alone.
    """
    through = rolled_through()
    return None if through is None else min(raw_cutoff(now), through)


_FIELDS = ['count', 'temp_min', 'temp_avg', 'temp_max', 'hum_min', 'hum_avg', 'hum_max']


def _roll_up_between(start: datetime, end: datetime, days_per_pass: int) -> int:
    """Summarise every hour from `start` up to, not including, `end` (both on the hour), a few days at a time."""
    written = 0
    while start < end:
        stop = min(start + timedelta(days=days_per_pass), end)
        rows = (
            SensorReading.objects.filter(room__isnull=False, timestamp__gte=start, timestamp__lt=stop)
            .annotate(hour=TruncHour('timestamp', tzinfo=_UTC))
            .values('room_id', 'hour')
            .order_by()
            .annotate(
                n=Count('pk'),
                tmin=Min('temperature'), tavg=Avg('temperature'), tmax=Max('temperature'),
                hmin=Min('humidity'), havg=Avg('humidity'), hmax=Max('humidity'),
            )
        )
        summaries = [
            SensorReadingHourly(
                room_id=r['room_id'], hour=r['hour'], count=r['n'],
                temp_min=r['tmin'], temp_avg=r['tavg'], temp_max=r['tmax'],
                hum_min=r['hmin'], hum_avg=r['havg'], hum_max=r['hmax'],
            )
            for r in rows
        ]
        SensorReadingHourly.objects.bulk_create(
            summaries, batch_size=1000, update_conflicts=True, unique_fields=['room', 'hour'], update_fields=_FIELDS,
        )
        written += len(summaries)
        start = stop
    return written


def roll_up(now: datetime | None = None, since: datetime | None = None, days_per_pass: int = 7) -> int:
    """Summarise the complete hours not summarised yet. Returns how many rows it wrote.

    With no `since` it goes on from the newest summary (two hours back, for late readings), or from the oldest reading the first time.
    """
    until = hour_floor(now or timezone.now())
    if since is None:
        through = rolled_through()
        if through is None:
            oldest = SensorReading.objects.filter(room__isnull=False).aggregate(oldest=Min('timestamp'))['oldest']
            if oldest is None:
                return 0
            since = oldest
        else:
            since = through - OVERLAP
    return _roll_up_between(hour_floor(since), until, days_per_pass)


def delete_rolled_up(now: datetime | None = None, step: int = 5000) -> int:
    """Remove the raw readings that are older than the keeping time and whose hour has a summary. Returns how many."""
    cutoff = raw_cutoff(now)
    summarised = SensorReadingHourly.objects.filter(room_id=OuterRef('room_id'), hour=OuterRef('hour'))
    removable = (
        SensorReading.objects.filter(room__isnull=False, timestamp__lt=cutoff)
        .annotate(hour=TruncHour('timestamp', tzinfo=_UTC))
        .filter(Exists(summarised))
    )
    removed = 0
    while True:
        # In small steps, so the database is never held for long by one delete.
        ids = list(removable.order_by().values_list('pk', flat=True)[:step])
        if not ids:
            return removed
        removed += SensorReading.objects.filter(pk__in=ids).delete()[0]


def prune_raw(now: datetime | None = None, step: int = 5000) -> int:
    """Summarise what is about to be removed, then remove it. Safe to run every night."""
    cutoff = raw_cutoff(now)
    oldest = SensorReading.objects.filter(room__isnull=False).aggregate(oldest=Min('timestamp'))['oldest']
    if oldest is not None and oldest < cutoff:
        _roll_up_between(hour_floor(oldest), cutoff, 7)
    return delete_rolled_up(now, step)


def rollups_for_batch(batch, stays=None):
    """The summaries of a batch: those of each room it stayed in, for the hours of the stay (the hour of a move counts for the room left)."""
    condition = Q(pk__in=[])
    for stay in BatchRoomStay.objects.filter(batch=batch) if stays is None else stays:
        in_stay = Q(room_id=stay.room_id, hour__gte=hour_floor(stay.started_at))
        if stay.ended_at is not None:
            in_stay &= Q(hour__lt=stay.ended_at)
        condition |= in_stay
    return SensorReadingHourly.objects.filter(condition)
