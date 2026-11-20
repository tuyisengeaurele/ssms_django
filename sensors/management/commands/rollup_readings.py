"""
Management command: rollup_readings
Summarises sensor readings by the hour, then removes the raw readings that are older than SENSOR_RAW_KEEP_DAYS (30) and have a summary.

Run by the nightly job (.github/workflows/jobs-nightly.yml). By hand:
    python manage.py rollup_readings --dry-run
    python manage.py rollup_readings
    python manage.py rollup_readings --since 2026-10-01    # write the summaries again from a day, for readings added late
"""
from datetime import datetime
from datetime import timezone as dt_timezone

from django.conf import settings
from django.utils import timezone

from logs.jobs import LoggedCommand
from sensors.models import SensorReading
from sensors.rollups import prune_raw, raw_cutoff, roll_up


class Command(LoggedCommand):
    help = 'Summarise sensor readings by the hour and remove the old raw readings that have a summary.'

    def add_arguments(self, parser):
        parser.add_argument('--since', help='Summarise again from this day (YYYY-MM-DD), for readings that were added late.')
        parser.add_argument('--dry-run', action='store_true', help='Say how many raw readings are old enough to go, and change nothing.')

    def handle(self, *args, **options):
        cutoff = raw_cutoff()
        if options['dry_run']:
            old = SensorReading.objects.filter(room__isnull=False, timestamp__lt=cutoff).count()
            self.stdout.write(self.style.WARNING(
                f'[DRY RUN] {old} raw readings are older than {settings.SENSOR_RAW_KEEP_DAYS} days '
                f'(before {cutoff:%Y-%m-%d %H:%M} UTC). Nothing was summarised or removed.'
            ))
            return
        since = datetime.strptime(options['since'], '%Y-%m-%d').replace(tzinfo=dt_timezone.utc) if options.get('since') else None
        written = roll_up(now=timezone.now(), since=since)
        removed = prune_raw(now=timezone.now())
        self.stdout.write(self.style.SUCCESS(
            f'Wrote {written} hourly summaries. Removed {removed} raw readings older than {settings.SENSOR_RAW_KEEP_DAYS} days '
            f'(before {cutoff:%Y-%m-%d %H:%M} UTC).'
        ))
