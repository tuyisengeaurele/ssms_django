"""A batch's readings over a chosen time, averaged into buckets small enough to draw."""
from datetime import timedelta

from django.utils import timezone

from .room_readings import readings_for_batch


def bucket_hours_for(hours: int) -> int:
    """One hour buckets up to a week, six hour buckets beyond it, so a month still draws as a short line."""
    return 1 if hours <= 168 else 6


def batch_series(batch, hours: int) -> list:
    """The last `hours` hours of a batch, oldest first, as {'timestamp', 'temperature', 'humidity', 'count'} points."""
    bucket_hours = bucket_hours_for(hours)
    since = timezone.now() - timedelta(hours=hours)

    rows = (
        readings_for_batch(batch)
        .filter(timestamp__gte=since)
        .order_by('timestamp')
        .values_list('timestamp', 'temperature', 'humidity')
    )
    buckets = {}
    for stamp, temperature, humidity in rows:
        start = stamp.replace(minute=0, second=0, microsecond=0)
        start = start.replace(hour=start.hour // bucket_hours * bucket_hours)
        total = buckets.setdefault(start, [0.0, 0.0, 0])
        total[0] += temperature
        total[1] += humidity
        total[2] += 1

    return [
        {
            'timestamp': start.isoformat(),
            'temperature': round(temp_sum / count, 1),
            'humidity': round(hum_sum / count, 1),
            'count': count,
        }
        for start, (temp_sum, hum_sum, count) in sorted(buckets.items())
    ]
