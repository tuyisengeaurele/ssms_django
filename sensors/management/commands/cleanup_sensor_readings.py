"""
Management command: cleanup_sensor_readings
Deletes SensorReading rows older than --days (default 90).

Run manually:
    python manage.py cleanup_sensor_readings
    python manage.py cleanup_sensor_readings --days 60

Schedule via Render cron job (dashboard → Jobs):
    Command : python manage.py cleanup_sensor_readings
    Schedule: 0 2 * * 0   (every Sunday at 02:00 UTC)
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from sensors.models import SensorReading


class Command(BaseCommand):
    help = 'Delete sensor readings older than N days to prevent unbounded table growth.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=90,
            help='Delete readings older than this many days (default: 90).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print how many rows would be deleted without actually deleting.',
        )

    def handle(self, *args, **options):
        days     = options['days']
        dry_run  = options['dry_run']
        cutoff   = timezone.now() - timedelta(days=days)

        qs = SensorReading.objects.filter(timestamp__lt=cutoff)
        count = qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'[DRY RUN] Would delete {count} sensor readings older than {days} days '
                    f'(before {cutoff.strftime("%Y-%m-%d %H:%M UTC")}).'
                )
            )
            return

        if count == 0:
            self.stdout.write(self.style.SUCCESS(f'No sensor readings older than {days} days. Nothing to do.'))
            return

        deleted, _ = qs.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f'Deleted {deleted} sensor readings older than {days} days '
                f'(before {cutoff.strftime("%Y-%m-%d %H:%M UTC")}).'
            )
        )
