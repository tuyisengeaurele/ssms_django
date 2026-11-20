"""The calendar reads plain values, not a model object for every event.

For an admin it makes thousands of events from a month of a big deployment, and each one used to build a batch and a farm just to
read an id, a name and a date from them: about 300 ms of Python for a page whose database work takes 43. The guard counts the model
objects made while the events are found.
"""
from datetime import date, datetime
from datetime import timezone as tz

import pytest
from django.db.models.signals import post_init

from alerts.models import AlertLog
from batches.models import Batch
from core.farm_calendar import events
from farms.models import Farm
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    HarvestRecordFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

WATCHED = (Batch, Farm, AlertLog, DiseaseDetection, HarvestRecord)


def a_busy_month():
    farm = FarmFactory(name='Hill Farm')
    for number in range(6):
        batch = BatchFactory(farm=farm)
        Batch.objects.filter(pk=batch.pk).update(
            start_date=datetime(2026, 11, 3 + number, 9, tzinfo=tz.utc), expected_harvest_date=datetime(2026, 11, 20 + number, 9, tzinfo=tz.utc),
        )
        check = DiseaseDetectionFactory(batch=batch, result='Healthy')
        DiseaseDetection.objects.filter(pk=check.pk).update(detected_at=datetime(2026, 11, 8, 9, tzinfo=tz.utc))
        stage = AlertLogFactory(batch=batch, type='STAGE_CHANGE', message='Batch stage updated to LARVA.')
        AlertLog.objects.filter(pk=stage.pk).update(created_at=datetime(2026, 11, 9, 9, tzinfo=tz.utc))
        if number % 2:
            record = HarvestRecordFactory(batch=batch)
            HarvestRecord.objects.filter(pk=record.pk).update(harvested_at=datetime(2026, 11, 12, 9, tzinfo=tz.utc))
    return farm


def test_finding_the_events_builds_no_batch_farm_alert_detection_or_harvest_object():
    a_busy_month()
    admin = UserFactory(role='ADMIN')
    made = []
    handlers = []
    for model in WATCHED:
        handler = lambda sender, **kw: made.append(sender.__name__)  # noqa: E731
        post_init.connect(handler, sender=model, weak=False)
        handlers.append((model, handler))
    try:
        found, _ = events(admin, date(2026, 11, 1), date(2026, 11, 30))
    finally:
        for model, handler in handlers:
            post_init.disconnect(handler, sender=model)
    assert len(found) > 20            # the month has something in it, so the check means something
    assert made == [], f'{len(made)} model objects made: {sorted(set(made))}'


def test_the_events_say_what_they_said_before():
    farm = a_busy_month()
    found, more = events(UserFactory(role='ADMIN'), date(2026, 11, 1), date(2026, 11, 30))
    kinds = sorted({event['kind'] for event in found})
    assert kinds == ['batch_started', 'disease_check', 'harvest_expected', 'harvest_recorded', 'stage_changed']
    started = [event for event in found if event['kind'] == 'batch_started']
    assert len(started) == 6 and more is False
    first = started[0]
    assert first['farm_id'] == farm.pk and first['farm_name'] == 'Hill Farm'
    assert first['batch_id'] and first['id'] == f'batch_started:{first["batch_id"]}' and first['detail'] == {} and first['expected'] is False
    assert [event['detail']['stage'] for event in found if event['kind'] == 'stage_changed'] == ['LARVA'] * 6
    # Harvest expected only for the batches that have not been harvested: 3 of the 6 have a record.
    assert len([event for event in found if event['kind'] == 'harvest_expected']) == 3
