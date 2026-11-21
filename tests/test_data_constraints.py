"""The database refuses values the API would never accept, so a script, a shell or a bug cannot leave them behind.

Each case saves with `save()` or `create()`, which run no validators, so only a CHECK constraint can say no. The edges the
API already allows (a room of 1 or 5000 square metres, a reading of -40 or 85 degrees) must still be saved.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from batches.models import Batch, BatchRoomStay, MortalityRecord
from farms.models import AREA_MAX, AREA_MIN, Farm, RearingRoom
from sensors.models import DiseaseDetection, IoTDevice, SensorReading, SensorReadingHourly
from tests.factories import BatchFactory, FarmFactory, IoTDeviceFactory

pytestmark = pytest.mark.django_db


def refused(make):
    """True when the database refuses what `make` saves."""
    try:
        with transaction.atomic():
            make()
    except IntegrityError:
        return True
    return False


@pytest.fixture
def farm():
    return FarmFactory()


@pytest.fixture
def room(farm):
    return RearingRoom.objects.create(farm=farm, name='A')


# ── batches ──────────────────────────────────────────────────────────────────────────────────

def test_a_batch_cannot_have_a_stage_that_does_not_exist(farm):
    assert refused(lambda: BatchFactory(farm=farm, stage='NYMPH'))


def test_a_batch_cannot_have_a_quantity_unit_that_does_not_exist(farm):
    assert refused(lambda: BatchFactory(farm=farm, quantity_unit='KILOS'))


@pytest.mark.parametrize('quantity', [0, 1, 5000, None])
def test_a_batch_quantity_is_empty_or_at_least_one(farm, quantity):
    saved = not refused(lambda: BatchFactory(farm=farm, quantity=quantity))
    assert saved is (quantity != 0)


def test_every_stage_and_unit_the_app_offers_is_still_saved(farm):
    for stage in ('EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST'):
        for unit in ('BOXES', 'WORMS'):
            BatchFactory(farm=farm, stage=stage, quantity_unit=unit)
    assert Batch.objects.count() == 10


def test_a_mortality_entry_must_count_at_least_one_worm(farm):
    batch = BatchFactory(farm=farm)
    today = timezone.localdate()
    assert refused(lambda: MortalityRecord.objects.create(batch=batch, count=0, recorded_on=today))
    MortalityRecord.objects.create(batch=batch, count=1, recorded_on=today)


def test_a_stay_cannot_end_before_it_starts(room, farm):
    batch = BatchFactory(farm=farm)
    start = timezone.now()
    assert refused(lambda: BatchRoomStay.objects.create(batch=batch, room=room, started_at=start, ended_at=start - timedelta(hours=1)))
    BatchRoomStay.objects.create(batch=batch, room=room, started_at=start, ended_at=start)
    BatchRoomStay.objects.create(batch=batch, room=room, started_at=start, ended_at=None)


# ── rooms ────────────────────────────────────────────────────────────────────────────────────

def test_a_room_cannot_have_an_approval_state_that_does_not_exist(farm):
    assert refused(lambda: RearingRoom.objects.create(farm=farm, name='B', approval_status='maybe'))


@pytest.mark.parametrize('area, saved', [
    (AREA_MIN, True), (AREA_MAX, True), (Decimal('12.50'), True), (None, True),
    (AREA_MIN - Decimal('0.01'), False), (AREA_MAX + Decimal('0.01'), False), (Decimal('-3'), False),
])
def test_a_room_size_stays_inside_the_range_the_form_allows(farm, area, saved):
    assert (not refused(lambda: RearingRoom.objects.create(farm=farm, name='C', area_m2=area))) is saved
    assert (not refused(lambda: RearingRoom.objects.create(farm=farm, name='D', pending_area_m2=area))) is saved


# ── devices and readings ─────────────────────────────────────────────────────────────────────

def test_a_device_cannot_have_a_status_that_does_not_exist():
    assert refused(lambda: IoTDeviceFactory(status='asleep'))
    for status in ('online', 'offline', 'error'):
        IoTDeviceFactory(status=status)
    assert IoTDevice.objects.count() == 3


@pytest.mark.parametrize('temperature, humidity, saved', [
    (-40, 0, True), (85, 100, True), (25.5, 78, True),
    (-40.1, 50, False), (85.1, 50, False), (25, -0.1, False), (25, 100.1, False),
])
def test_a_reading_stays_inside_what_a_sensor_can_report(room, temperature, humidity, saved):
    made = lambda: SensorReading.objects.create(room=room, temperature=temperature, humidity=humidity)  # noqa: E731
    assert (not refused(made)) is saved


def test_an_hourly_summary_counts_at_least_one_reading_and_keeps_low_below_high(room):
    base = dict(room=room, hour=timezone.now().replace(minute=0, second=0, microsecond=0), count=3,
                temp_min=20, temp_avg=22, temp_max=24, hum_min=60, hum_avg=70, hum_max=80)
    assert refused(lambda: SensorReadingHourly.objects.create(**{**base, 'count': 0}))
    assert refused(lambda: SensorReadingHourly.objects.create(**{**base, 'temp_min': 30}))
    assert refused(lambda: SensorReadingHourly.objects.create(**{**base, 'hum_min': 90}))
    SensorReadingHourly.objects.create(**base)


@pytest.mark.parametrize('confidence, saved', [(0, True), (1, True), (0.42, True), (-0.01, False), (1.01, False)])
def test_a_disease_check_has_a_confidence_between_zero_and_one(farm, confidence, saved):
    batch = BatchFactory(farm=farm)
    made = lambda: DiseaseDetection.objects.create(batch=batch, image_url='x', result='Healthy', confidence=confidence)  # noqa: E731
    assert (not refused(made)) is saved


# ── farms ────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('latitude, longitude, saved', [
    (-1.94, 30.06, True), (90, 180, True), (-90, -180, True), (None, None, True),
    (90.1, 30, False), (-90.1, 30, False), (-1.9, 180.1, False), (-1.9, -180.1, False),
])
def test_a_farm_position_is_a_real_place_on_earth(latitude, longitude, saved):
    owner = FarmFactory().owner
    made = lambda: Farm.objects.create(name='F', location='Gatsibo', owner=owner, latitude=latitude, longitude=longitude)  # noqa: E731
    assert (not refused(made)) is saved
