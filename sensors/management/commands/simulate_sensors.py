"""
Django management command — silkworm IoT sensor simulator.

Creates / updates named IoTDevice records and generates realistic
temperature & humidity readings for all active batches.

Usage (one-shot):
    python manage.py simulate_sensors

Usage (continuous loop, every 24 h by default):
    python manage.py simulate_sensors --loop

Usage (custom interval, e.g. every 30 s for testing):
    python manage.py simulate_sensors --loop --interval 30

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
from sensors.models import IoTDevice, SensorReading


# ─────────────────────────────────────────────────────────────────────────────
# Realistic value generators
# ─────────────────────────────────────────────────────────────────────────────

def _temperature() -> float:
    """Centres around 25 °C with a time-of-day sinusoidal variation."""
    hour = datetime.now().hour
    base = 25.0 + 1.5 * math.sin((hour - 2) * math.pi / 12)
    return round(base + random.gauss(0, 1.5), 1)


def _humidity() -> float:
    """Centres around 77.5 % with mild inverse correlation to temperature."""
    hour = datetime.now().hour
    base = 77.5 - 2.5 * math.sin((hour - 2) * math.pi / 12)
    return round(base + random.gauss(0, 3.0), 1)


# ─────────────────────────────────────────────────────────────────────────────
# Device name templates  (one device per batch, named after its farm + sector)
# ─────────────────────────────────────────────────────────────────────────────

SENSOR_TYPES = ['DHT22', 'AM2301', 'SHT31']


def _device_key(batch_id: str) -> str:
    return f'ssms-dev-{batch_id[-12:]}'


def _device_name(batch) -> str:
    farm_slug = batch.farm.name[:10].replace(' ', '-').upper() if batch.farm else 'UNKNOWN'
    sensor    = SENSOR_TYPES[hash(batch.id) % len(SENSOR_TYPES)]
    return f'{sensor}-{farm_slug}'


# ─────────────────────────────────────────────────────────────────────────────
# Command
# ─────────────────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = (
        'Simulate IoT sensor readings for all active batches. '
        'Creates/updates named IoTDevice records and generates realistic '
        'temperature & humidity data. Run once or continuously with --loop.'
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
            default=86400,
            metavar='SECONDS',
            help='Seconds between rounds when --loop is active (default: 86400 = 24 h).',
        )
        parser.add_argument(
            '--batch',
            type=str,
            default=None,
            metavar='BATCH_ID',
            help='Restrict simulation to a single batch ID.',
        )

    def handle(self, *args, **options):
        loop     = options['loop']
        interval = options['interval']
        batch_id = options.get('batch')

        self.stdout.write(self.style.SUCCESS(
            '\n╔══════════════════════════════════════════╗\n'
            '║   SSMS IoT Sensor Simulator              ║\n'
            '╚══════════════════════════════════════════╝\n'
        ))

        if loop:
            self.stdout.write(self.style.SUCCESS(
                f'  Mode     : continuous loop\n'
                f'  Interval : {interval} s\n'
                f'  Press Ctrl+C to stop.\n'
            ))
            try:
                while True:
                    self._insert_round(batch_id)
                    time.sleep(interval)
            except KeyboardInterrupt:
                self.stdout.write(self.style.WARNING('\n[simulate_sensors] Stopped by user.'))
        else:
            self.stdout.write(self.style.SUCCESS('  Mode     : one-shot\n'))
            self._insert_round(batch_id)

    # ── helpers ───────────────────────────────────────────────────────────────

    def _insert_round(self, batch_id: str | None = None):
        qs = Batch.objects.select_related('farm').filter(is_active=True)
        if batch_id:
            qs = qs.filter(pk=batch_id)

        batches = list(qs)

        if not batches:
            self.stdout.write(self.style.WARNING(
                '[simulate_sensors] No active batches found — nothing inserted.'
            ))
            return

        now      = timezone.now()
        readings = []

        self.stdout.write(f'\n[{now.strftime("%Y-%m-%d %H:%M:%S UTC")}]  Inserting readings for {len(batches)} batch(es):\n')
        self.stdout.write(f'  {"Device":<26}  {"Farm":<18}  {"Temp":>6}  {"Humidity":>9}  {"Status"}')
        self.stdout.write(f'  {"──────":<26}  {"────":<18}  {"────":>6}  {"────────":>9}  ──────')

        for batch in batches:
            temp = _temperature()
            hum  = _humidity()

            # ── ensure device record exists ──────────────────────────────────
            dev_key  = _device_key(batch.id)
            dev_name = _device_name(batch)
            device, _ = IoTDevice.objects.update_or_create(
                device_key=dev_key,
                defaults={
                    'name':      dev_name,
                    'farm':      batch.farm,
                    'batch':     batch,
                    'location':  batch.farm.location if batch.farm else '',
                    'status':    IoTDevice.STATUS_ONLINE,
                    'last_seen': now,
                    'is_active': True,
                },
            )

            reading = SensorReading(
                batch_id=batch.id,
                device=device,
                temperature=temp,
                humidity=hum,
            )
            readings.append(reading)

            # Determine health status
            temp_ok = 22.0 <= temp <= 28.0
            hum_ok  = 70.0 <= hum  <= 85.0
            if temp_ok and hum_ok:
                status_label = self.style.SUCCESS('✓ Normal')
            else:
                flags = []
                if not temp_ok: flags.append('TEMP!')
                if not hum_ok:  flags.append('HUM!')
                status_label = self.style.WARNING('⚠ ' + ' '.join(flags))

            farm_name = batch.farm.name[:16] if batch.farm else '—'
            self.stdout.write(
                f'  {dev_name:<26}  {farm_name:<18}  {temp:>5.1f}°C  {hum:>7.1f}%  {status_label}'
            )

        SensorReading.objects.bulk_create(readings)

        # Alert checks
        from alerts.utils import check_sensor_alerts
        alert_count = 0
        for r in readings:
            triggered = check_sensor_alerts(r.batch_id, r.temperature, r.humidity)
            alert_count += len(triggered)

        self.stdout.write(
            self.style.SUCCESS(
                f'\n  ✔ {len(readings)} reading(s) saved.'
                + (f'  {alert_count} alert(s) triggered.' if alert_count else '')
                + '\n'
            )
        )
