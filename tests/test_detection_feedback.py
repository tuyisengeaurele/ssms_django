"""Saying whether a disease check was right. The answers show how well the check does on real photos."""
import pytest

from audit_log.models import AuditLog
from sensors.models import DiseaseDetection
from tests.factories import BatchFactory, CooperativeFactory, DiseaseDetectionFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def owner(coop):
    return UserFactory(role='FARMER', cooperative=coop)


@pytest.fixture
def detection(owner):
    return DiseaseDetectionFactory(batch=BatchFactory(farm=FarmFactory(owner=owner)), result='Grasserie')


def answer(client, detection, **body):
    return client.post(f'/api/detections/{detection.pk}/feedback', body, format='json')


def test_the_owner_can_say_the_result_was_right(auth_client, owner, detection):
    response = answer(auth_client(owner), detection, isCorrect=True)
    assert response.status_code == 200
    assert response.json()['message'] == 'Thank you. Your answer was saved.'
    data = response.json()['data']
    assert data['isCorrect'] is True and data['actualResult'] is None and data['feedbackAt']
    detection.refresh_from_db()
    assert detection.is_correct is True


def test_the_owner_can_say_it_was_wrong_and_what_it_really_was(auth_client, owner, detection):
    response = answer(auth_client(owner), detection, isCorrect=False, actualResult='Grasserie')
    assert response.status_code == 200
    detection.refresh_from_db()
    assert (detection.is_correct, detection.actual_result) == (False, 'Grasserie')


def test_wrong_without_saying_what_it_was_is_fine(auth_client, owner, detection):
    assert answer(auth_client(owner), detection, isCorrect=False).status_code == 200
    detection.refresh_from_db()
    assert (detection.is_correct, detection.actual_result) == (False, None)


def test_a_right_answer_forgets_any_result_sent_with_it(auth_client, owner, detection):
    answer(auth_client(owner), detection, isCorrect=True, actualResult='Grasserie')
    detection.refresh_from_db()
    assert detection.actual_result is None


@pytest.mark.parametrize('actual', ['Healthy', 'Grasserie', 'Something else'])
def test_every_listed_result_is_taken(auth_client, owner, detection, actual):
    assert answer(auth_client(owner), detection, isCorrect=False, actualResult=actual).status_code == 200


@pytest.mark.parametrize('actual', ['Plague', '', 'healthy', 'x' * 50, 5])
def test_a_result_that_is_not_in_the_list_is_refused_in_plain_words(auth_client, owner, detection, actual):
    response = answer(auth_client(owner), detection, isCorrect=False, actualResult=actual)
    assert response.status_code == 422
    assert response.json()['errors']['actualResult'] == ['Please choose one of the listed results.']


@pytest.mark.parametrize('body', [{}, {'isCorrect': 'yes'}, {'isCorrect': None}, {'isCorrect': 1}, {'actualResult': 'Healthy'}])
def test_the_answer_has_to_be_yes_or_no(auth_client, owner, detection, body):
    response = auth_client(owner).post(f'/api/detections/{detection.pk}/feedback', body, format='json')
    assert response.status_code == 422
    assert response.json()['errors']['isCorrect'] == ['Please say whether the result was correct.']


def test_a_later_answer_replaces_the_earlier_one(auth_client, owner, detection):
    client = auth_client(owner)
    answer(client, detection, isCorrect=False, actualResult='Grasserie')
    first = DiseaseDetection.objects.get(pk=detection.pk).feedback_at
    answer(client, detection, isCorrect=True)
    detection.refresh_from_db()
    assert (detection.is_correct, detection.actual_result) == (True, None)
    assert detection.feedback_at >= first


def test_a_new_detection_has_no_answer_yet(detection):
    assert (detection.is_correct, detection.actual_result, detection.feedback_at) == (None, None, None)


def test_the_answer_is_written_to_the_audit_log(auth_client, owner, detection):
    answer(auth_client(owner), detection, isCorrect=False, actualResult='Grasserie')
    entry = AuditLog.objects.filter(resource='DiseaseDetection', resource_id=detection.pk).latest('created_at')
    assert entry.action == 'UPDATE' and 'Grasserie' in entry.detail


# ── who may answer ──────────────────────────────────────────────────────────

def test_a_supervisor_of_the_cooperative_and_an_admin_may_answer(auth_client, coop, detection):
    for person in (UserFactory(role='SUPERVISOR', cooperative=coop), UserFactory(role='ADMIN')):
        assert answer(auth_client(person), detection, isCorrect=True).status_code == 200


def test_other_people_are_told_it_is_not_there(auth_client, detection):
    for person in (
        UserFactory(role='FARMER'),
        UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory()),
        UserFactory(role='SUPERVISOR'),
    ):
        assert answer(auth_client(person), detection, isCorrect=True).status_code == 404
    detection.refresh_from_db()
    assert detection.is_correct is None


def test_a_check_on_a_deleted_batch_cannot_be_answered(auth_client, owner, detection):
    batch = detection.batch
    batch.is_active = False
    batch.save(update_fields=['is_active'])
    assert answer(auth_client(owner), detection, isCorrect=True).status_code == 404


def test_signing_in_is_needed(api_client, detection):
    assert answer(api_client, detection, isCorrect=True).status_code == 401


def test_an_unknown_check_is_not_found(auth_client, owner):
    response = auth_client(owner).post('/api/detections/nope/feedback', {'isCorrect': True}, format='json')
    assert response.status_code == 404


# ── where the answer shows up ───────────────────────────────────────────────

def test_the_lists_carry_the_answer(auth_client, owner, detection):
    client = auth_client(owner)
    answer(client, detection, isCorrect=False, actualResult='Grasserie')
    row = client.get(f'/api/detections/batch/{detection.batch_id}').json()['data'][0]
    assert (row['isCorrect'], row['actualResult']) == (False, 'Grasserie')
    history = client.get('/api/detections/history').json()['data']
    history = history['items'] if isinstance(history, dict) else history
    assert (history[0]['isCorrect'], history[0]['actualResult']) == (False, 'Grasserie')


def test_a_check_with_no_answer_says_so_with_nulls(auth_client, owner, detection):
    row = auth_client(owner).get(f'/api/detections/batch/{detection.batch_id}').json()['data'][0]
    assert (row['isCorrect'], row['actualResult'], row['feedbackAt']) == (None, None, None)
