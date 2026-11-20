"""A batch's readings over a chosen time, averaged into buckets small enough to draw."""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .rollups import hour_floor, rolled_through, rollups_for_batch
from .room_readings import readings_for_batch

# A chart of more than this reads the hourly summaries, plus the raw readings of the hours not summarised yet.
SUMMARIES_ABOVE_HOURS = 168


def bucket_hours_for(hours: int) -> int:
    """One hour buckets up to a week, six hour buckets beyond it, so a month still draws as a short line."""
    return 1 if hours <= 168 else 6


def _start_of_bucket(stamp, bucket_hours: int):
    start = stamp.replace(minute=0, second=0, microsecond=0)
    return start.replace(hour=start.hour // bucket_hours * bucket_hours)


def _points(buckets: dict) -> list:
    return [
        {
            'timestamp': start.isoformat(),
            'temperature': round(temp_sum / count, 1),
            'humidity': round(hum_sum / count, 1),
            'count': count,
        }
        for start, (temp_sum, hum_sum, count) in sorted(buckets.items())
    ]


def batch_series(batch, hours: int) -> list:
    """The last `hours` hours of a batch, oldest first, as {'timestamp', 'temperature', 'humidity', 'count'} points.

    Up to a week it reads the raw readings. Beyond that it reads the hourly summaries for the hours that have one and the raw readings
    for the rest (the hours since the last nightly run, and readings from before rooms), so the chart is whole at any hour of the day.
    """
    bucket_hours = bucket_hours_for(hours)
    since = timezone.now() - timedelta(hours=hours)
    buckets = {}

    def add(stamp, temp_sum, hum_sum, n):
        total = buckets.setdefault(_start_of_bucket(stamp, bucket_hours), [0.0, 0.0, 0])
        total[0] += temp_sum
        total[1] += hum_sum
        total[2] += n

    raw = readings_for_batch(batch).filter(timestamp__gte=since)
    if hours > SUMMARIES_ABOVE_HOURS:
        through = rolled_through()
        if through is not None:
            summaries = (
                rollups_for_batch(batch).filter(hour__gte=hour_floor(since), hour__lt=through)
                .order_by('hour').values_list('hour', 'temp_avg', 'hum_avg', 'count')
            )
            for hour, temp_avg, hum_avg, n in summaries:
                add(hour, temp_avg * n, hum_avg * n, n)
            raw = raw.filter(Q(room__isnull=True) | Q(timestamp__gte=through))

    for stamp, temperature, humidity in raw.order_by('timestamp').values_list('timestamp', 'temperature', 'humidity'):
        add(stamp, temperature, humidity, 1)
    return _points(buckets)
