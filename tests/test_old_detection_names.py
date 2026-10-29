"""A command that lists saved results the check can no longer give. It only reads."""
from io import StringIO

import pytest
from django.core.management import call_command

from alerts.models import AlertLog
from sensors.models import DiseaseDetection
from tests.factories import AlertLogFactory, BatchFactory, DiseaseDetectionFactory

pytestmark = pytest.mark.django_db


def run(**options):
    out = StringIO()
    call_command('list_old_detection_names', stdout=out, **options)
    return out.getvalue()


def test_it_says_so_when_every_result_is_one_the_check_can_give():
    DiseaseDetectionFactory(result='Healthy')
    DiseaseDetectionFactory(result='Grasserie')
    assert 'Every saved result is one the check can give' in run()


def test_it_counts_each_old_name():
    batch = BatchFactory()
    DiseaseDetectionFactory(batch=batch, result='Flacherie')
    DiseaseDetectionFactory(batch=batch, result='Flacherie')
    DiseaseDetectionFactory(batch=batch, result='Muscardine')
    DiseaseDetectionFactory(batch=batch, result='Healthy')
    text = run()
    assert 'Flacherie: 2' in text
    assert 'Muscardine: 1' in text
    assert 'Healthy' not in text


def test_it_counts_the_disease_alerts_that_name_an_old_disease():
    batch = BatchFactory()
    AlertLogFactory(batch=batch, type='DISEASE', message='Pebrine suspected in this batch (80% confidence).')
    AlertLogFactory(batch=batch, type='DISEASE', message='Grasserie suspected in this batch (80% confidence).')
    AlertLogFactory(batch=batch, type='TEMPERATURE', message='Temperature too low: 21.0 C')
    assert 'Disease alerts naming an old disease: 1' in run()


def test_it_changes_nothing():
    batch = BatchFactory()
    DiseaseDetectionFactory(batch=batch, result='Flacherie')
    AlertLogFactory(batch=batch, type='DISEASE', message='Flacherie suspected in this batch (80% confidence).')
    run()
    assert DiseaseDetection.objects.filter(result='Flacherie').count() == 1
    assert AlertLog.objects.filter(type='DISEASE').count() == 1


def test_it_says_that_it_changes_nothing():
    DiseaseDetectionFactory(result='Pebrine')
    assert 'Nothing was changed.' in run()


def test_it_works_on_an_empty_database():
    assert 'Every saved result is one the check can give' in run()
