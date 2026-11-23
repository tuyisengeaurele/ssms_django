"""Fill a scratch database with the size of a real deployment, to see how the API behaves when it is not a demo.

    createdb ssms_load                                   (any name with "scratch", "load" or "measure" in it)
    DB_NAME=ssms_load python manage.py migrate
    DB_NAME=ssms_load python manage.py createcachetable
    DB_NAME=ssms_load python scripts/seed_load_data.py                       (200 farms, 1,000 batches, 30 days)
    DB_NAME=ssms_load python scripts/profile_endpoints.py                    (then time what people read)

What it makes, with the defaults: 5 cooperatives with a supervisor each, 200 farmers with a farm each (2 rooms and a sensor
in each room, 5 batches: 2 running and 3 harvested), an hourly reading for every sensor over 30 days (about 288,000 rows),
the alerts, disease checks and harvest records such a month leaves, and a round of eggs open in each cooperative with
requests waiting. Every account ends in @load.ssms.rw, none has a usable password (the profile script signs in with a token),
and nothing is sent anywhere.

It will not run against a database whose name does not say it is a scratch one, and not against one that already holds load
data. To start again, drop the database and make it anew: deleting 288,000 readings row by row is slower than that.
"""
from __future__ import annotations

import argparse
import math
import os
import random
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from pathlib import Path

DOMAIN = 'load.ssms.rw'
DISTRICTS = ['Gatsibo', 'Kayonza', 'Nyagatare', 'Rwamagana', 'Kirehe']
CYCLE_DAYS = 28
STAGE_STARTS = [('EGG', 0), ('LARVA', 4), ('PUPA', 17), ('COCOON', 22), ('HARVEST', 28)]
PICTURE = '/images/og-1200x630.jpg'
# A database name must say it is not the real one. A test database (test_...) counts, because the tests of this script use one.
SCRATCH_WORDS = ('scratch', 'load', 'measure', 'test')


class NotAScratchDatabase(Exception):
    pass


def check_database_name(name: str) -> None:
    """Refuse anything that is not plainly a scratch database, before a single row is written."""
    if name == 'ssms_db' or not any(word in name.lower() for word in SCRATCH_WORDS):
        raise NotAScratchDatabase(
            f'The database "{name}" does not look like a scratch one. Use a name with one of {", ".join(SCRATCH_WORDS)} in it, '
            'for example ssms_load. This script makes thousands of rows and must never touch real data.',
        )


def stage_at(age_days: float) -> str:
    stage = 'EGG'
    for name, start in STAGE_STARTS:
        if age_days >= start:
            stage = name
    return stage


@contextmanager
def dates_set_by_hand(*pairs):
    """The models stamp the real time on every new row. For the length of this block the dates given are the ones written."""
    saved = []
    for model, name in pairs:
        field = model._meta.get_field(name)
        saved.append((field, field.auto_now_add))
        field.auto_now_add = False
    try:
        yield
    finally:
        for field, value in saved:
            field.auto_now_add = value


def _places() -> list[dict]:
    """The place fields of a farm in the first village of each district, found once."""
    from locations import registry

    found = []
    nodes = list(registry.walk())
    for district in DISTRICTS:
        code = next(p['code'] for p in nodes if p['level'] == 'district' and p['name'] == district)
        village = min(p['code'] for p in nodes if p['level'] == 'village' and p['code'].startswith(code))
        chain = registry.chain(village)
        fields = {f'{level}_code': chain[level]['code'] for level in registry.LEVELS}
        found.append({**fields, 'location': registry.describe(chain)})
    return found


def seed(farms=200, batches_per_farm=5, days=30, cooperatives=5, seed_number=2026, now=None, log=print) -> dict:
    """Make the world and say how many rows of each kind it holds."""
    from django.contrib.auth.hashers import make_password
    from django.db import connection

    from alerts.models import AlertLog
    from batches.models import Batch, BatchRoomStay
    from cooperatives.models import Cooperative, CooperativeMembership
    from farms.models import Farm, RearingRoom
    from harvest.models import HarvestRecord
    from sensors.models import DiseaseDetection, IoTDevice, SensorReading
    from supply.models import EggRequest, SupplyRound
    from users.models import User

    check_database_name(connection.settings_dict['NAME'])
    if User.objects.filter(email__endswith=f'@{DOMAIN}').exists():
        raise SystemExit('This database already holds load data. Drop it and make it anew to start again.')

    rng = random.Random(seed_number)
    now = (now or datetime.now(dt_timezone.utc)).replace(minute=0, second=0, microsecond=0)
    started = time.monotonic()
    places = _places()
    nobody = make_password(None)   # a password nobody can type: the profile script signs in with a token

    def step(text):
        log(f'  {time.monotonic() - started:6.1f}s  {text}')

    # People and cooperatives
    coops = Cooperative.objects.bulk_create([
        Cooperative(name=f'Load Silk Cooperative {n + 1}', location=f'{DISTRICTS[n % len(DISTRICTS)]}, Rwanda', description='Load data.')
        for n in range(cooperatives)
    ])
    staff = [User(email=f'supervisor{n + 1}@{DOMAIN}', name=f'Supervisor {n + 1}', role='SUPERVISOR', cooperative=coop, is_email_verified=True, password=nobody, phone=f'+25073{n + 1:07d}')
             for n, coop in enumerate(coops)]
    staff.append(User(email=f'admin@{DOMAIN}', name='Load Admin', role='ADMIN', is_email_verified=True, password=nobody, phone='+250730000000'))
    farmers = [User(email=f'farmer{n + 1}@{DOMAIN}', name=f'Farmer {n + 1}', role='FARMER', cooperative=coops[n % cooperatives], is_email_verified=True, password=nobody, phone=f'+25072{n + 1:07d}')
               for n in range(farms)]
    User.objects.bulk_create(staff + farmers)
    # bulk_create does not run User.save, so the memberships it would have opened are made here.
    CooperativeMembership.objects.bulk_create([
        CooperativeMembership(user_id=u.pk, cooperative_id=u.cooperative_id, started_at=now)
        for u in staff + farmers if u.cooperative_id
    ], batch_size=1000)
    step(f'{len(staff)} staff and {len(farmers)} farmers')

    # Farms, rooms, devices
    farm_rows, room_rows, device_rows = [], [], []
    for n, farmer in enumerate(farmers):
        place = places[n % len(places)]
        farm = Farm(name=f'Load Farm {n + 1}', owner=farmer, **place)
        farm_rows.append(farm)
        for r in range(2):
            room = RearingRoom(farm=farm, name=f'Rearing house {r + 1}')
            room_rows.append(room)
            device_rows.append(IoTDevice(
                name=f'DHT22 Farm {n + 1}{"AB"[r]}', device_key=f'ssms-load-{n + 1}{"ab"[r]}', farm=farm, room=room,
                location=f'{place["location"]} / {room.name}', status='online', is_active=True,
            ))
    Farm.objects.bulk_create(farm_rows, batch_size=1000)
    RearingRoom.objects.bulk_create(room_rows, batch_size=1000)
    IoTDevice.objects.bulk_create(device_rows, batch_size=1000)
    step(f'{len(farm_rows)} farms, {len(room_rows)} rooms, {len(device_rows)} sensors')

    # Batches: two running in the two rooms, the rest harvested within the month
    batch_rows, stays, harvests, checks, alerts = [], [], [], [], []
    for n, farm in enumerate(farm_rows):
        rooms = room_rows[n * 2:n * 2 + 2]
        for b in range(batches_per_farm):
            running = b < 2
            age = rng.uniform(2, CYCLE_DAYS - 2) if running else CYCLE_DAYS + rng.uniform(1, days - 1)
            start = now - timedelta(days=age)
            batch = Batch(
                farm=farm, stage=stage_at(age) if running else 'HARVEST', expected_harvest_date=start + timedelta(days=CYCLE_DAYS),
                notes='Load batch', quantity=rng.randint(1, 4), room=rooms[b] if running else None,
            )
            batch.start_date = start
            batch.created_at = start
            batch_rows.append(batch)
            room = rooms[b % 2]
            stays.append(BatchRoomStay(batch=batch, room=room, started_at=start, ended_at=None if running else start + timedelta(days=CYCLE_DAYS)))
            for stage, begins in STAGE_STARTS[1:]:
                if age >= begins:
                    when = start + timedelta(days=begins)
                    alerts.append(AlertLog(batch=batch, type='STAGE_CHANGE', message=f'Batch stage updated to {stage}.', created_at=when, is_read=when < now - timedelta(days=2)))
            if not running:
                gathered = start + timedelta(days=CYCLE_DAYS + 1)
                weight = round(rng.uniform(10.0, 18.0), 2)
                record = HarvestRecord(batch=batch, cocoon_weight_kg=weight, silk_yield_g=round(weight * 120, 2), quality_grade=rng.choice(['A', 'A', 'B', 'C']), notes='Load harvest')
                record.harvested_at = gathered
                record.created_at = gathered
                harvests.append(record)
            for c in range(2 if running else 1):
                when = now - timedelta(days=1 + c * 3, hours=rng.randint(0, 5))
                sick = rng.random() < 0.04
                checks.append(DiseaseDetection(
                    batch=batch, image_url=PICTURE, result='Grasserie' if sick else 'Healthy',
                    confidence=round(rng.uniform(0.75, 0.99), 4), detected_at=when,
                ))
                if sick:
                    alerts.append(AlertLog(batch=batch, type='DISEASE', message='Grasserie suspected in this batch (80% confidence).', created_at=when))
    with dates_set_by_hand((Batch, 'start_date'), (Batch, 'created_at'), (HarvestRecord, 'harvested_at'), (HarvestRecord, 'created_at'), (DiseaseDetection, 'detected_at')):
        Batch.objects.bulk_create(batch_rows, batch_size=1000)
        BatchRoomStay.objects.bulk_create(stays, batch_size=1000)
        HarvestRecord.objects.bulk_create(harvests, batch_size=1000)
        DiseaseDetection.objects.bulk_create(checks, batch_size=1000)
    step(f'{len(batch_rows)} batches, {len(harvests)} harvest records, {len(checks)} disease checks')

    # Readings, hourly, and the air problems they would have raised
    readings = []
    total_readings = 0
    horizon = days * 24
    with dates_set_by_hand((SensorReading, 'timestamp'), (AlertLog, 'created_at')):
        for room, device in zip(room_rows, device_rows):
            excursions = sorted(rng.randrange(horizon) for _ in range(rng.choice([0, 1, 1, 2, 3])))
            for hour in range(horizon + 1):
                moment = now - timedelta(hours=horizon - hour)
                wave = math.sin(2 * math.pi * (moment.hour - 9) / 24)
                temperature = 25.0 + 1.5 * wave + max(-0.8, min(0.8, rng.gauss(0, 0.4)))
                humidity = 77.0 - 3.0 * wave + max(-2.4, min(2.4, rng.gauss(0, 1.2)))
                readings.append(SensorReading(room=room, device=device, temperature=round(temperature, 1), humidity=round(min(humidity, 100.0), 1), timestamp=moment))
            for at in excursions:
                kind = rng.choice(['TEMPERATURE', 'HUMIDITY'])
                moment = now - timedelta(hours=horizon - at)
                length = timedelta(hours=rng.randint(2, 10))
                ended = moment + length < now
                alerts.append(AlertLog(
                    room=room, type=kind, message='Temperature outside the safe range.' if kind == 'TEMPERATURE' else 'Humidity outside the safe range.',
                    created_at=moment, resolved_at=moment + length if ended else None, is_read=moment < now - timedelta(days=2),
                ))
            if len(readings) >= 20000:
                SensorReading.objects.bulk_create(readings, batch_size=5000)
                total_readings += len(readings)
                readings = []
        SensorReading.objects.bulk_create(readings, batch_size=5000)
        total_readings += len(readings)
        AlertLog.objects.bulk_create(alerts, batch_size=2000)
    IoTDevice.objects.filter(device_key__startswith='ssms-load-').update(last_seen=now)
    step(f'{total_readings} readings, {len(alerts)} alerts')

    # A round of eggs open in each cooperative, with requests waiting for the supervisor
    rounds = SupplyRound.objects.bulk_create([
        SupplyRound(
            cooperative=coop, name='Load round', stock_boxes=max(20, farms // cooperatives), status='open',
            request_deadline=now + timedelta(days=5), delivery_date=(now + timedelta(days=12)).date(),
            delivery_place='Cooperative store', expected_harvest_date=(now + timedelta(days=52)).date(),
        )
        for coop in coops
    ])
    by_coop = {r.cooperative_id: r for r in rounds}
    asks = []
    for n, farm in enumerate(farm_rows):
        if rng.random() < 0.25:
            asks.append(EggRequest(round=by_coop[farm.owner.cooperative_id], farmer=farm.owner, farm=farm, room=room_rows[n * 2], boxes_asked=rng.randint(1, 3), status='submitted'))
    EggRequest.objects.bulk_create(asks, batch_size=1000)
    step(f'{len(rounds)} rounds, {len(asks)} egg requests')

    return {
        'cooperatives': len(coops), 'staff': len(staff), 'farmers': len(farmers), 'farms': len(farm_rows), 'rooms': len(room_rows),
        'devices': len(device_rows), 'batches': len(batch_rows), 'readings': total_readings, 'alerts': len(alerts),
        'detections': len(checks), 'harvests': len(harvests), 'rounds': len(rounds), 'egg_requests': len(asks),
    }


def setup_django() -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ssms_django.settings')
    import django

    django.setup()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Fill a scratch database with load-sized data.')
    parser.add_argument('--farms', type=int, default=200)
    parser.add_argument('--batches-per-farm', type=int, default=5)
    parser.add_argument('--days', type=int, default=30, help='Days of hourly readings (default 30).')
    parser.add_argument('--cooperatives', type=int, default=5)
    parser.add_argument('--seed', type=int, default=2026, help='Same number, same data.')
    options = parser.parse_args(argv)
    setup_django()
    from django.db import connection

    print(f'Database: {connection.settings_dict["NAME"]}')
    try:
        counts = seed(options.farms, options.batches_per_farm, options.days, options.cooperatives, options.seed)
    except NotAScratchDatabase as refusal:
        print(refusal, file=sys.stderr)
        return 2
    print('Done: ' + ', '.join(f'{value} {name}' for name, value in counts.items()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
