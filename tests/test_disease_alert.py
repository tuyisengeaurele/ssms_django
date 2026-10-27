"""A disease check that finds a disease raises an alert on the batch."""
from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from alerts.models import AlertLog
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory
from tests.test_detection_upload import ai_answer, image_bytes, upload

pytestmark = pytest.mark.django_db

URL = '/api/detections'


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def owner(coop):
    return UserFactory(role='FARMER', cooperative=coop, name='Mugisha Serge', email='serge@example.rw')


@pytest.fixture
def batch(owner):
    return BatchFactory(farm=FarmFactory(owner=owner, name='Serge Farm'))


@pytest.fixture
def email():
    with mock.patch('alerts.utils._send_mail_async') as sent:
        yield sent


@pytest.fixture
def ai():
    client = mock.MagicMock()
    with mock.patch('sensors.detection_views.httpx.Client', return_value=client), \
            mock.patch('sensors.detection_views._upload_to_cloudinary', return_value='https://example.invalid/w.jpg'):
        yield client.__enter__.return_value


def check(auth_client, person, batch, ai, result='Flacherie', confidence=0.83):
    ai.post.return_value = ai_answer(body={'result': result, 'confidence': confidence, 'allScores': {result: confidence}})
    return auth_client(person).post(URL, {'batchId': batch.pk, 'image': upload(image_bytes())}, format='multipart')


def disease_alerts(batch):
    return AlertLog.objects.filter(batch=batch, type='DISEASE')


# ── when an alert is raised ─────────────────────────────────────────────────

@pytest.mark.parametrize('disease', ['Flacherie', 'Grasserie', 'Muscardine', 'Pebrine'])
def test_each_disease_raises_an_alert_on_the_batch(auth_client, owner, batch, ai, email, disease):
    assert check(auth_client, owner, batch, ai, disease, 0.83).status_code == 201
    alert = disease_alerts(batch).get()
    assert alert.room_id is None and alert.is_read is False and alert.resolved_at is None
    assert alert.message == f'{disease} suspected in this batch (83% confidence). Check the batch and ask your supervisor to take a look.'


def test_a_healthy_result_raises_nothing(auth_client, owner, batch, ai, email):
    check(auth_client, owner, batch, ai, 'Healthy', 0.97)
    assert AlertLog.objects.count() == 0


def test_a_result_the_page_does_not_know_raises_nothing(auth_client, owner, batch, ai, email):
    check(auth_client, owner, batch, ai, 'Class_7', 0.9)
    assert AlertLog.objects.count() == 0


def test_a_disease_the_check_is_not_sure_about_raises_nothing(auth_client, owner, batch, ai, email):
    check(auth_client, owner, batch, ai, 'Pebrine', 0.49)
    assert AlertLog.objects.count() == 0


def test_a_disease_at_the_limit_does_raise_one(auth_client, owner, batch, ai, email):
    check(auth_client, owner, batch, ai, 'Pebrine', 0.5)
    assert disease_alerts(batch).count() == 1


def test_the_limit_is_a_setting(auth_client, owner, batch, ai, email, settings):
    settings.DISEASE_ALERT_MIN_CONFIDENCE = 0.9
    check(auth_client, owner, batch, ai, 'Pebrine', 0.8)
    assert AlertLog.objects.count() == 0


def test_every_positive_check_is_its_own_alert(auth_client, owner, batch, ai, email):
    check(auth_client, owner, batch, ai, 'Flacherie', 0.83)
    check(auth_client, owner, batch, ai, 'Grasserie', 0.7)
    assert disease_alerts(batch).count() == 2


def test_the_answer_says_whether_an_alert_was_raised(auth_client, owner, batch, ai, email):
    assert check(auth_client, owner, batch, ai, 'Flacherie', 0.83).json()['data']['alertRaised'] is True
    assert check(auth_client, owner, batch, ai, 'Healthy', 0.97).json()['data']['alertRaised'] is False
    assert check(auth_client, owner, batch, ai, 'Pebrine', 0.3).json()['data']['alertRaised'] is False


def test_the_check_still_works_when_the_alert_cannot_be_saved(auth_client, owner, batch, ai, email):
    with mock.patch.object(AlertLog.objects, 'create', side_effect=RuntimeError('db')):
        response = check(auth_client, owner, batch, ai)
    assert response.status_code == 201
    assert response.json()['data']['alertRaised'] is False


def test_a_check_that_fails_raises_no_alert(auth_client, owner, batch, ai, email):
    ai.post.return_value = ai_answer(status=500, text='boom')
    response = auth_client(owner).post(URL, {'batchId': batch.pk, 'image': upload(image_bytes())}, format='multipart')
    assert response.status_code == 502
    assert AlertLog.objects.count() == 0


# ── who sees it ─────────────────────────────────────────────────────────────

def test_the_owner_a_supervisor_and_an_admin_see_it_in_their_alerts(auth_client, coop, owner, batch, ai, email):
    check(auth_client, owner, batch, ai)
    for person in (owner, UserFactory(role='SUPERVISOR', cooperative=coop), UserFactory(role='ADMIN')):
        rows = auth_client(person).get('/api/alerts?unread=false').json()['data']
        assert [r['type'] for r in rows] == ['DISEASE']
        assert rows[0]['batch']['id'] == batch.pk


def test_other_people_do_not(auth_client, owner, batch, ai, email):
    check(auth_client, owner, batch, ai)
    assert auth_client(UserFactory(role='FARMER')).get('/api/alerts?unread=false').json()['data'] == []


# ── the email ───────────────────────────────────────────────────────────────

def test_no_email_when_the_owner_made_the_check_because_the_result_is_on_their_screen(auth_client, owner, batch, ai, email):
    check(auth_client, owner, batch, ai)
    email.assert_not_called()


def test_the_owner_is_emailed_when_someone_else_made_the_check(auth_client, coop, owner, batch, ai, email):
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    check(auth_client, supervisor, batch, ai, 'Pebrine', 0.9)
    kwargs = email.call_args.kwargs
    assert kwargs['recipient_list'] == ['serge@example.rw']
    assert 'Serge Farm' in kwargs['subject']
    assert 'Pebrine suspected' in kwargs['message']
    assert '90%' in kwargs['message']
    assert f'#{batch.pk[-8:].upper()}' in kwargs['message']


def test_a_run_of_positive_checks_by_someone_else_sends_one_email_an_hour(auth_client, coop, owner, batch, ai, email):
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    for _ in range(3):
        check(auth_client, supervisor, batch, ai)
    assert email.call_count == 1
    assert disease_alerts(batch).count() == 3


def test_after_an_hour_the_next_one_sends_again(auth_client, coop, owner, batch, ai, email):
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    check(auth_client, supervisor, batch, ai)
    AlertLog.objects.filter(batch=batch).update(created_at=timezone.now() - timedelta(minutes=61))
    check(auth_client, supervisor, batch, ai)
    assert email.call_count == 2


def test_an_owner_with_no_email_address_is_skipped_quietly(auth_client, coop, batch, ai, email):
    batch.farm.owner.email = ''
    batch.farm.owner.save(update_fields=['email'])
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    assert check(auth_client, supervisor, batch, ai).status_code == 201
    email.assert_not_called()
