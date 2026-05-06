"""
Django management command — silkworm sensor data simulator.

Usage (one-shot):
    python manage.py simulate_sensors

Usage (continuous, every 5 min):
    python manage.py simulate_sensors --loop

Usage (custom interval, e.g. every 60 s for testing):
    python manage.py simulate_sensors --loop --interval 60

Usage (single batch only):
    python manage.py simulate_sensors --batch <batch_id>
"""

import math
import random
import time
from datetime import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from batches.models import Batch
from sensors.models import SensorReading


# ─────────────────────────────────────────────────────────────────────────────
# Realistic value generators
# ─────────────────────────────────────────────────────────────────────────────

def _temperature() -> float:
    """
    Centres around 25 C with time-of-day variation.
    Gaussian noise (std=1.5) means ~15% of readings fall outside 22-28 C,
    which triggers TEMPERATURE alerts to keep the system testable.
    """
    hour = datetime.now().hour
    base = 25.0 + 1.5 * math.sin((hour - 2) * math.pi / 12)
    return round(base + random.gauss(0, 1.5), 1)


def _humidity() -> float:
    """
    Centres around 77.5 % with mild inverse correlation to temperature.
    Gaussian noise (std=3.0) means ~15% of readings fall outside 70-85 %,
    which triggers HUMIDITY alerts.
    """
    hour = datetime.now().hour
    base = 77.5 - 2.5 * math.sin((hour - 2) * math.pi / 12)
    return round(base + random.gauss(0, 3.0), 1)


# ─────────────────────────────────────────────────────────────────────────────
# Command
# ─────────────────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = (
        'Simulate realistic temperature & humidity readings for all active '
        'batches. Run once or continuously with --loop.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--loop',
            action='store_true',
            default=False,
            help='Keep running and insert a new round every --interval seconds.',
        )
        parser.add_argument(
            '--interval',
            type=int,
            default=300,
            metavar='SECONDS',
            help='Seconds between rounds when --loop is active (default: 300 = 5 min).',
        )
        parser.add_argument(
            '--batch',
            type=str,
            default=None,
            metavar='BATCH_ID',
            help='Restrict simulation to a single batch ID.',
        )

    def handle(self, *args, **options):
        loop = options['loop']
        interval = options['interval']
        batch_id = options['batch']

        if loop:
            self.stdout.write(
                self.style.SUCCESS(
                    f'[simulate_sensors] Looping every {interval}s — press Ctrl+C to stop.\n'
                )
            )
            try:
                while True:
                    self._insert_round(batch_id)
                    time.sleep(interval)
            except KeyboardInterrupt:
                self.stdout.write(self.style.WARNING('\n[simulate_sensors] Stopped by user.'))
        else:
            self._insert_round(batch_id)

    # ── helpers ───────────────────────────────────────────────────────────────

    def _insert_round(self, batch_id: str | None = None):
        qs = Batch.objects.filter(is_active=True)
        if batch_id:
            qs = qs.filter(pk=batch_id)

        batches = list(qs.values_list('id', flat=True))

        if not batches:
            self.stdout.write(
                self.style.WARNING('[simulate_sensors] No active batches found — nothing inserted.')
            )
            return

        readings = [
            SensorReading(
                batch_id=bid,
                temperature=_temperature(),
                humidity=_humidity(),
            )
            for bid in batches
        ]
        SensorReading.objects.bulk_create(readings)

        # Check each reading against alert thresholds
        from alerts.utils import check_sensor_alerts
        alert_count = 0
        for r in readings:
            triggered = check_sensor_alerts(r.batch_id, r.temperature, r.humidity)
            alert_count += len(triggered)

        ts = timezone.now().strftime('%Y-%m-%d %H:%M:%S UTC')
        self.stdout.write(
            self.style.SUCCESS(
                f'[{ts}] OK — Inserted {len(readings)} reading(s) across {len(batches)} batch(es).'
                + (f' {alert_count} alert(s) triggered.' if alert_count else '')
            )
        )
        for r in readings:
            self.stdout.write(f'    batch {r.batch_id[-8:]}  =>  {r.temperature} C  /  {r.humidity} %')
