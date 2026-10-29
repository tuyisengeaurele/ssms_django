"""The check is about silkworms. A photo that is not a clear silkworm gets a calm answer and nothing is saved."""
from unittest import mock

import pytest

from alerts.disease import DISEASES, is_positive
from alerts.models import AlertLog
from sensors.detection_views import ACTUAL_RESULTS
from sensors.models import DiseaseDetection
from tests.factories import BatchFactory, DiseaseDetectionFactory, FarmFactory, UserFactory
from tests.test_detection_upload import ai_answer, image_bytes, upload

pytestmark = pytest.mark.django_db

URL = '/api/detections'


@pytest.fixture
def owner():
    return UserFactory()


@pytest.fixture
def batch(owner):
    return BatchFactory(farm=FarmFactory(owner=owner))


@pytest.fixture
def ai():
    """The AI service and the photo store, standing in. `store` says whether a photo was uploaded."""
    client = mock.MagicMock()
    with mock.patch('sensors.detection_views.httpx.Client', return_value=client), \
            mock.patch('sensors.detection_views._upload_to_cloudinary', return_value='https://example.invalid/w.jpg') as store:
        service = client.__enter__.return_value
        service.store = store
        yield service


def check(auth_client, owner, batch, ai, result, confidence=0.9, scores=None):
    body = {'result': result, 'confidence': confidence, 'allScores': scores or {'Grasserie': 0.04, 'Healthy': 0.03}}
    ai.post.return_value = ai_answer(body=body)
    return auth_client(owner).post(URL, {'batchId': batch.pk, 'image': upload(image_bytes())}, format='multipart')


# ── a photo that is not a silkworm, or not clear enough ─────────────────────────────────────

@pytest.mark.parametrize('result, words', [
    ('NotSilkworm', 'does not look like a silkworm'),
    ('Uncertain', 'not sure'),
])
def test_an_unclear_photo_gets_a_calm_answer(auth_client, owner, batch, ai, result, words):
    response = check(auth_client, owner, batch, ai, result, 0.5)
    assert response.status_code == 200
    data = response.json()
    assert data['data']['result'] == result
    assert data['data']['confidence'] == 0.5
    assert words in data['message']


@pytest.mark.parametrize('result', ['NotSilkworm', 'Uncertain'])
def test_an_unclear_photo_is_not_saved_and_not_uploaded(auth_client, owner, batch, ai, result):
    check(auth_client, owner, batch, ai, result, 0.5)
    assert DiseaseDetection.objects.count() == 0
    assert ai.store.call_count == 0


@pytest.mark.parametrize('result', ['NotSilkworm', 'Uncertain'])
def test_an_unclear_photo_never_raises_an_alert(auth_client, owner, batch, ai, result):
    check(auth_client, owner, batch, ai, result, 0.99)
    assert AlertLog.objects.count() == 0


def test_an_unclear_photo_says_nothing_about_leaves(auth_client, owner, batch, ai):
    text = check(auth_client, owner, batch, ai, 'NotSilkworm', 0.97).content.decode().lower()
    assert 'rust' not in text and 'leaf' not in text


# ── a result this version does not know ─────────────────────────────────────────────────────

@pytest.mark.parametrize('old', ['Flacherie', 'Muscardine', 'Pebrine', 'leaf_rust', 'Class_3'])
def test_a_result_an_older_service_might_send_is_refused_not_saved(auth_client, owner, batch, ai, old):
    response = check(auth_client, owner, batch, ai, old, 0.9)
    assert response.status_code == 502
    assert response.json()['message'] == "The disease check couldn't finish. Please try again."
    assert DiseaseDetection.objects.count() == 0 and AlertLog.objects.count() == 0


def test_an_answer_with_no_result_is_refused_not_saved(auth_client, owner, batch, ai):
    ai.post.return_value = ai_answer(body={'confidence': 0.9})
    response = auth_client(owner).post(URL, {'batchId': batch.pk, 'image': upload(image_bytes())}, format='multipart')
    assert response.status_code == 502
    assert DiseaseDetection.objects.count() == 0


# ── the two results about a silkworm ────────────────────────────────────────────────────────

def test_a_healthy_silkworm_is_saved_without_an_alert(auth_client, owner, batch, ai):
    response = check(auth_client, owner, batch, ai, 'Healthy', 0.93)
    assert response.status_code == 201
    assert DiseaseDetection.objects.get().result == 'Healthy'
    assert AlertLog.objects.count() == 0


def test_a_grasserie_silkworm_is_saved_with_an_alert(auth_client, owner, batch, ai):
    response = check(auth_client, owner, batch, ai, 'Grasserie', 0.88)
    assert response.status_code == 201
    assert response.json()['data']['alertRaised'] is True
    assert AlertLog.objects.filter(type='DISEASE').count() == 1


# ── the rules ───────────────────────────────────────────────────────────────────────────────

def test_grasserie_is_the_only_disease_the_check_can_find():
    assert DISEASES == ['Grasserie']


@pytest.mark.parametrize('name', ['Flacherie', 'Muscardine', 'Pebrine', 'NotSilkworm', 'Uncertain', 'Healthy'])
def test_nothing_else_is_ever_positive(name):
    assert is_positive(name, 0.99) is False


def test_the_farmer_can_say_it_was_healthy_grasserie_or_something_else():
    assert ACTUAL_RESULTS == ['Healthy', 'Grasserie', 'Something else']


@pytest.mark.parametrize('old', ['Flacherie', 'Muscardine', 'Pebrine'])
def test_an_answer_naming_a_disease_the_check_cannot_find_is_refused(auth_client, owner, old):
    detection = DiseaseDetectionFactory(batch=BatchFactory(farm=FarmFactory(owner=owner)), result='Grasserie')
    response = auth_client(owner).post(f'/api/detections/{detection.pk}/feedback', {'isCorrect': False, 'actualResult': old}, format='json')
    assert response.status_code == 422
