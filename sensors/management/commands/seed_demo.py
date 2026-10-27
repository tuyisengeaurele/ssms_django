"""
Fill the database with a believable month of data for a demo.

    python manage.py seed_demo                 # 30 days, sign in details printed at the end
    python manage.py seed_demo --days 14       # a shorter history
    python manage.py seed_demo --reset         # throw away the demo data and build it again
    python manage.py seed_demo --password X    # choose the password of the demo accounts

It adds a cooperative, a supervisor, three farmers, their farms, a running and a finished batch each, a sensor
device per batch, hourly readings, disease checks, harvest records and the alerts that follow from the readings.
The alerts come from the same rules as the live system, so the demo shows what the product really does.

Everything it makes can be told apart: the accounts end in @demo.ssms.rw, the cooperative is "Demo Silk
Cooperative" and device keys start with ssms-demo-. Nothing else in the database is read or changed, and --reset
removes only those rows.
"""
import math
import random
import secrets
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from alerts.models import AlertLog
from alerts.utils import humidity_problem, safe_range_for, temperature_problem
from batches.models import Batch
from cooperatives.models import Cooperative
from core.validators import validate_new_password
from farms.models import Farm
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection, IoTDevice, SensorReading
from users.models import User

DEMO_DOMAIN = 'demo.ssms.rw'
COOP_NAME = 'Demo Silk Cooperative'
DEVICE_PREFIX = 'ssms-demo-'
PICTURE = '/images/og-1200x630.jpg'

# A batch is this many days old when it enters each stage. The stage a batch is in follows from its age.
STAGE_STARTS = [('EGG', 0), ('LARVA', 4), ('PUPA', 17), ('COCOON', 22), ('HARVEST', 28)]
CYCLE_DAYS = 28

FARMERS = [
    # name, farm, place, age in days of the running batch
    ('Jean Bosco Habimana', 'Habimana Silk Farm', 'Gatsibo District, Eastern Province', 12),
    ('Marie Claire Mukamana', 'Mukamana Cocoon Farm', 'Kayonza District, Eastern Province', 20),
    ('Eric Niyonzima', 'Niyonzima Mulberry Farm', 'Nyagatare District, Eastern Province', 25),
]
# Days ago that each finished batch was harvested.
HARVESTED_DAYS_AGO = [2, 3, 4]

# Something to see on the dashboards: (hours ago it starts, hours ago it ends, temperature change, humidity change)
EXCURSIONS = {
    'ssms-demo-1a': [(120, 114, -5.5, 0.0)],   # a cold night, long over
    'ssms-demo-2a': [(4, 0, 0.0, 11.0)],       # a humid spell that is still going on
}


def stage_at(age_days: float) -> str:
    current = STAGE_STARTS[0][0]
    for stage, start in STAGE_STARTS:
        if age_days >= start:
            current = stage
    return current


def make_password() -> str:
    while True:
        candidate = f'Demo-{secrets.token_hex(3)}-{secrets.token_hex(3).upper()}'
        try:
            validate_new_password(candidate)
            return candidate
        except Exception:
            continue


class Command(BaseCommand):
    help = 'Fill the database with a believable month of demo data. Only its own rows are ever touched.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=30, help='Days of readings to create (default 30).')
        parser.add_argument('--reset', action='store_true', help='Remove the demo data first and build it again.')
        parser.add_argument('--password', default=None, help='Password for the demo accounts. A strong one is made if left out.')
        parser.add_argument('--seed', type=int, default=2026, help='Same number, same data (default 2026).')
        parser.add_argument('--now', default=None, help='Treat this moment as now, for example 2026-10-27T12:00:00+00:00.')

    def handle(self, *args, **options):
        days = options['days']
        if not 1 <= days <= 120:
            raise CommandError('Please choose between 1 and 120 days.')
        now = datetime.fromisoformat(options['now']) if options['now'] else timezone.now()
        now = now.replace(minute=0, second=0, microsecond=0)

        with transaction.atomic():
            if options['reset']:
                self._remove_demo_data()
            elif User.objects.filter(email__endswith=f'@{DEMO_DOMAIN}').exists():
                self.stdout.write('The demo data is already there. Use --reset to build it again.')
                return

            password = options['password'] or make_password()
            self._build(days, now, random.Random(options['seed']), password)

        self.stdout.write(self.style.SUCCESS('Demo data is ready.'))
        self.stdout.write(f'Sign in as supervisor@{DEMO_DOMAIN} or farmer1@{DEMO_DOMAIN} to farmer3@{DEMO_DOMAIN}.')
        if not options['password']:
            self.stdout.write(f'Password: {password}')

    # ── removing ─────────────────────────────────────────────────────────────

    def _remove_demo_data(self):
        IoTDevice.objects.filter(device_key__startswith=DEVICE_PREFIX).delete()
        # Deleting the people takes their farms, batches, readings, checks, harvests and alerts with them.
        User.objects.filter(email__endswith=f'@{DEMO_DOMAIN}').delete()
        Cooperative.objects.filter(name=COOP_NAME).delete()

    # ── building ─────────────────────────────────────────────────────────────

    def _build(self, days, now, rng, password):
        coop = Cooperative.objects.create(name=COOP_NAME, location='Eastern Province, Rwanda', description='Demo data for showing SSMS.')
        User.objects.create_user(
            email=f'supervisor@{DEMO_DOMAIN}', password=password, name='Claire Uwimana',
            role='SUPERVISOR', cooperative=coop, is_email_verified=True,
        )
        for number, (name, farm_name, place, age) in enumerate(FARMERS, start=1):
            farmer = User.objects.create_user(
                email=f'farmer{number}@{DEMO_DOMAIN}', password=password, name=name,
                role='FARMER', cooperative=coop, is_email_verified=True,
            )
            farm = Farm.objects.create(name=farm_name, location=place, owner=farmer)
            running = self._batch(farm, now, age_days=age, harvested_days_ago=None)
            finished = self._batch(farm, now, age_days=CYCLE_DAYS + HARVESTED_DAYS_AGO[number - 1], harvested_days_ago=HARVESTED_DAYS_AGO[number - 1])
            self._device(f'{DEVICE_PREFIX}{number}a', farm, running, f'{farm.name[:14]} A')
            self._device(f'{DEVICE_PREFIX}{number}b', farm, finished, f'{farm.name[:14]} B')

            self._readings_and_alerts(running, f'{DEVICE_PREFIX}{number}a', days, now, rng, end=now)
            end = now - timedelta(days=HARVESTED_DAYS_AGO[number - 1])
            self._readings_and_alerts(finished, f'{DEVICE_PREFIX}{number}b', days, now, rng, end=end)
            self._stage_history(running, now)
            self._stage_history(finished, now)
            self._harvest(finished, now, rng, HARVESTED_DAYS_AGO[number - 1])
            self._checks(running, now, rng, sick=(number == 2))
            self._checks(finished, now, rng, sick=False, count=1)

    def _batch(self, farm, now, age_days, harvested_days_ago):
        start = now - timedelta(days=age_days)
        stage = 'HARVEST' if harvested_days_ago is not None else stage_at(age_days)
        batch = Batch.objects.create(
            farm=farm, stage=stage, expected_harvest_date=start + timedelta(days=CYCLE_DAYS), notes='Demo batch',
        )
        # The dates are fixed by hand, because the model stamps them with the real time when a row is created.
        Batch.objects.filter(pk=batch.pk).update(start_date=start, created_at=start)
        batch.start_date = start
        return batch

    def _device(self, key, farm, batch, name):
        batch_running = batch.stage != 'HARVEST'
        IoTDevice.objects.create(
            name=f'DHT22 {name}', device_key=key, farm=farm, batch=batch, location=farm.location,
            status='online' if batch_running else 'offline', is_active=True,
        )

    def _readings_and_alerts(self, batch, device_key, days, now, rng, end):
        device = IoTDevice.objects.get(device_key=device_key)
        window_start = max(batch.start_date, now - timedelta(days=days))
        excursions = EXCURSIONS.get(device_key, [])
        ranges = {}

        readings, alerts, open_alerts = [], [], {}
        moment = window_start
        while moment <= end:
            hours_ago = (now - moment).total_seconds() / 3600
            wave = math.sin(2 * math.pi * (moment.hour - 9) / 24)
            temperature = 25.0 + 1.5 * wave + max(-0.8, min(0.8, rng.gauss(0, 0.4)))
            humidity = 77.0 - 3.0 * wave + max(-2.4, min(2.4, rng.gauss(0, 1.2)))
            for first, last, d_temp, d_hum in excursions:
                if last <= hours_ago <= first:
                    temperature += d_temp
                    humidity += d_hum
            temperature, humidity = round(temperature, 1), round(min(humidity, 100.0), 1)
            readings.append(SensorReading(batch=batch, device=device, temperature=temperature, humidity=humidity, timestamp=moment))

            stage = stage_at((moment - batch.start_date).total_seconds() / 86400)
            safe = ranges.setdefault(stage, safe_range_for(stage))
            for kind, message in (('TEMPERATURE', temperature_problem(temperature, safe)), ('HUMIDITY', humidity_problem(humidity, safe))):
                if message is None and kind in open_alerts:
                    open_alerts.pop(kind).resolved_at = moment
                elif message is not None and kind not in open_alerts:
                    alert = AlertLog(batch=batch, type=kind, message=message, created_at=moment, is_read=moment < now - timedelta(days=2))
                    open_alerts[kind] = alert
                    alerts.append(alert)
            moment += timedelta(hours=1)

        self._save_readings(readings)
        self._save_alerts(alerts)
        last = readings[-1].timestamp if readings else None
        IoTDevice.objects.filter(pk=device.pk).update(last_seen=last)

    @staticmethod
    def _save_with_dates(model, objects, *fields, one_by_one=False):
        """Create the rows with the dates they should have.

        The models stamp the real time on every new row, and Django copies that stamp onto the objects, so the
        wanted dates are remembered, put back, and written in a second step. Alerts are saved one at a time,
        because older databases have a native enum on alert_logs.type that Django's bulk insert cannot write into.
        """
        wanted = [[getattr(obj, field) for field in fields] for obj in objects]
        if one_by_one:
            for obj in objects:
                obj.save()
        else:
            model.objects.bulk_create(objects, batch_size=1000)
        for obj, values in zip(objects, wanted):
            for field, value in zip(fields, values):
                setattr(obj, field, value)
        model.objects.bulk_update(objects, list(fields), batch_size=1000)

    def _save_readings(self, readings):
        self._save_with_dates(SensorReading, readings, 'timestamp')

    def _save_alerts(self, alerts):
        self._save_with_dates(AlertLog, alerts, 'created_at', 'resolved_at', one_by_one=True)

    def _stage_history(self, batch, now):
        moves = []
        age = (now - batch.start_date).total_seconds() / 86400
        for stage, start in STAGE_STARTS[1:]:
            if age >= start:
                when = batch.start_date + timedelta(days=start)
                moves.append(AlertLog(
                    batch=batch, type='STAGE_CHANGE', message=f'Batch stage updated to {stage}.',
                    created_at=when, is_read=when < now - timedelta(days=2),
                ))
        self._save_alerts(moves)

    def _harvest(self, batch, now, rng, days_ago):
        when = now - timedelta(days=days_ago)
        weight = round(rng.uniform(10.0, 18.0), 2)
        record = HarvestRecord.objects.create(
            batch=batch, cocoon_weight_kg=weight, silk_yield_g=round(weight * 1000 * 0.12, 2),
            quality_grade=rng.choice(['A', 'A', 'B']), notes='Demo harvest',
        )
        HarvestRecord.objects.filter(pk=record.pk).update(harvested_at=when, created_at=when)

    def _checks(self, batch, now, rng, sick, count=3):
        checks, alerts = [], []
        for index in range(count):
            when = now - timedelta(days=1 + index * 3, hours=rng.randint(0, 5))
            if when < batch.start_date:
                continue
            checks.append(DiseaseDetection(
                batch=batch, image_url=PICTURE, result='Healthy', confidence=round(rng.uniform(0.9, 0.99), 4), detected_at=when,
            ))
        if sick and checks:
            when = now - timedelta(days=1)
            checks[0] = DiseaseDetection(batch=batch, image_url=PICTURE, result='Flacherie', confidence=0.78, detected_at=when)
            alerts.append(AlertLog(batch=batch, type='DISEASE', message='Flacherie suspected in this batch (78% confidence).', created_at=when))
        self._save_with_dates(DiseaseDetection, checks, 'detected_at')
        self._save_alerts(alerts)
