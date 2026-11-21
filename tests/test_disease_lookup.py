"""The results a check can give are rows in a `diseases` table, and each check says which version of the model gave it.

A check keeps its `result` text as before (reports, alerts and the screens read it). New checks also point at the disease, keep the
model version and keep every score the model gave, so a result can be traced to the model that made it and compared with a later one.
"""
from importlib import import_module
from unittest import mock

import pytest
from django.apps import apps
from django.db import IntegrityError, connection, transaction

from sensors.models import Disease, DiseaseDetection
from tests.factories import BatchFactory, DiseaseDetectionFactory, FarmFactory, UserFactory
from tests.test_detection_upload import ai_answer, image_bytes, upload

pytestmark = pytest.mark.django_db


def test_the_lookup_holds_the_results_the_app_knows():
    codes = set(Disease.objects.values_list('code', flat=True))
    assert {'Healthy', 'Grasserie', 'Flacherie', 'Muscardine', 'Pebrine'} <= codes


def test_only_healthy_is_healthy():
    assert list(Disease.objects.filter(is_healthy=True).values_list('code', flat=True)) == ['Healthy']


def test_a_check_made_the_old_way_still_has_its_result_and_no_disease_yet():
    check = DiseaseDetectionFactory(result='Grasserie', confidence=0.8)
    check.refresh_from_db()
    assert (check.result, check.confidence) == ('Grasserie', 0.8)
    assert check.disease_id is None and check.model_version == '' and check.probabilities == {}


def test_a_check_cannot_point_at_a_disease_that_is_not_in_the_lookup():
    check = DiseaseDetectionFactory()
    with pytest.raises(IntegrityError), transaction.atomic():
        DiseaseDetection.objects.filter(pk=check.pk).update(disease_id='Nonesuch')
        connection.check_constraints()


@pytest.fixture
def ai():
    client = mock.MagicMock()
    with mock.patch('sensors.detection_views.httpx.Client', return_value=client), \
            mock.patch('sensors.detection_views._upload_to_cloudinary', return_value='https://example.invalid/w.jpg'):
        yield client.__enter__.return_value


def make_check(auth_client, ai, body):
    owner = UserFactory()
    batch = BatchFactory(farm=FarmFactory(owner=owner))
    ai.post.return_value = ai_answer(body=body)
    return auth_client(owner).post('/api/detections', {'batchId': batch.pk, 'image': upload(image_bytes())}, format='multipart')


def test_a_new_check_keeps_its_disease_its_model_version_and_every_score(auth_client, ai):
    scores = {'Grasserie': 0.81, 'Healthy': 0.12}
    response = make_check(auth_client, ai, {'result': 'Grasserie', 'confidence': 0.81, 'allScores': scores, 'modelVersion': 'resnet50-2026-09'})
    assert response.status_code == 201
    saved = DiseaseDetection.objects.get()
    assert saved.disease_id == 'Grasserie' and saved.result == 'Grasserie'
    assert saved.model_version == 'resnet50-2026-09'
    assert saved.probabilities == scores


def test_an_answer_from_a_service_that_sends_no_version_is_still_saved(auth_client, ai):
    response = make_check(auth_client, ai, {'result': 'Healthy', 'confidence': 0.9, 'allScores': {'Healthy': 0.9}})
    assert response.status_code == 201
    saved = DiseaseDetection.objects.get()
    assert saved.disease_id == 'Healthy' and saved.model_version == ''


def test_the_answer_still_carries_the_fields_the_screens_read(auth_client, ai):
    response = make_check(auth_client, ai, {'result': 'Healthy', 'confidence': 0.9, 'allScores': {'Healthy': 0.9}, 'modelVersion': 'v1'})
    data = response.json()['data']
    for key in ('id', 'batchId', 'imageUrl', 'result', 'confidence', 'detectedAt', 'allScores'):
        assert key in data
    assert data['modelVersion'] == 'v1' and data['probabilities'] == {'Healthy': 0.9}


def test_the_migration_points_old_checks_at_their_disease_and_leaves_unknown_results_alone():
    known = DiseaseDetectionFactory(result='Grasserie')
    unknown = DiseaseDetectionFactory(result='SomethingNew')
    already = DiseaseDetectionFactory(result='Healthy', disease=Disease.objects.get(code='Healthy'))
    link = import_module('sensors.migrations.0013_link_old_checks_to_diseases').link_old_checks
    link(apps, None)
    link(apps, None)  # safe to run again
    for check in (known, unknown, already):
        check.refresh_from_db()
    assert (known.disease_id, unknown.disease_id, already.disease_id) == ('Grasserie', None, 'Healthy')
