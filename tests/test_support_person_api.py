"""The person's side of support access: the question, the answer, ending a visit, and the history.

Every lookup is scoped to the caller, so somebody else's request is "not found" and nothing more.
"""
import pytest

from audit_log.models import AuditLog
from logs.models import SecurityEvent
from support_access import services
from support_access.models import SupportAccess
from tests.factories import UserFactory
from tests.support_helpers import REASON, acting, admin_and_person, age
from users.models import UserSession

pytestmark = pytest.mark.django_db

URL = '/api/support-access/for-me'


def ask(admin, person, mode='view', minutes=30):
    return services.ask(admin, person, reason=REASON, minutes=minutes, mode=mode)


def answer(client, access, decision='allow', allow_edit=False):
    return client.post(f'{URL}/{access.pk}/respond', {'decision': decision, 'allowEdit': allow_edit}, format='json')


# ── pending ───────────────────────────────────────────────────────────────────

def test_pending_shows_the_question_asked_of_me_and_nobody_elses(jwt_client):
    admin, person = admin_and_person()
    other = UserFactory()
    access = ask(admin, person, mode='edit')

    mine = jwt_client(person).get(f'{URL}/pending').json()['data']
    assert mine['active'] is None
    assert mine['request']['id'] == access.pk and mine['request']['admin'] == {'name': admin.name}
    assert mine['request']['requestedMode'] == 'edit' and mine['request']['reason'] == REASON
    assert mine['request']['expiresAt']

    assert jwt_client(other).get(f'{URL}/pending').json()['data'] == {'request': None, 'active': None}


def test_the_question_lapses_by_itself_after_five_minutes(jwt_client):
    admin, person = admin_and_person()
    age(ask(admin, person), minutes=6)
    assert jwt_client(person).get(f'{URL}/pending').json()['data']['request'] is None


def test_pending_shows_a_visit_that_is_running(jwt_client):
    admin, person = admin_and_person()
    _, access = acting(admin, person, mode='edit')
    data = jwt_client(person).get(f'{URL}/pending').json()['data']
    assert data['request'] is None
    assert data['active']['id'] == access.pk and data['active']['grantedMode'] == 'edit' and data['active']['endsAt']


def test_a_question_that_was_answered_is_no_longer_pending(jwt_client):
    admin, person = admin_and_person()
    access = ask(admin, person)
    answer(jwt_client(person), access, 'reject')
    assert jwt_client(person).get(f'{URL}/pending').json()['data'] == {'request': None, 'active': None}


# ── answering ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('asked,ticked,granted', [('edit', True, 'edit'), ('edit', False, 'view'), ('view', True, 'view')])
def test_allow_grants_only_what_was_asked_and_ticked(jwt_client, asked, ticked, granted):
    admin, person = admin_and_person()
    access = ask(admin, person, mode=asked)
    response = answer(jwt_client(person), access, 'allow', ticked)
    assert response.status_code == 200, response.content
    assert response.json()['data']['status'] == 'approved' and response.json()['data']['grantedMode'] == granted


def test_reject_closes_the_request(jwt_client):
    admin, person = admin_and_person()
    access = ask(admin, person)
    assert answer(jwt_client(person), access, 'reject').json()['data']['status'] == 'rejected'


def test_the_answer_is_written_to_the_security_events_and_the_audit_log(jwt_client):
    admin, person = admin_and_person()
    allowed_one = ask(admin, person)
    answer(jwt_client(person), allowed_one, 'allow')
    other_admin, other_person = admin_and_person()
    refused_one = ask(other_admin, other_person)
    answer(jwt_client(other_person), refused_one, 'reject')

    kinds = set(SecurityEvent.objects.values_list('kind', flat=True))
    assert {'support_allowed', 'support_rejected'} <= kinds
    assert AuditLog.objects.filter(resource='SupportAccess', resource_id=allowed_one.pk).exists()


@pytest.mark.parametrize('decision', ['maybe', '', None])
def test_a_decision_must_be_allow_or_reject(jwt_client, decision):
    admin, person = admin_and_person()
    access = ask(admin, person)
    assert answer(jwt_client(person), access, decision).status_code == 400
    access.refresh_from_db()
    assert access.status == 'requested'


def test_somebody_elses_request_is_not_found(jwt_client):
    admin, person = admin_and_person()
    access = ask(admin, person)
    for verb in ('respond', 'end'):
        assert jwt_client(UserFactory()).post(f'{URL}/{access.pk}/{verb}', {'decision': 'allow'}, format='json').status_code == 404


def test_an_expired_or_answered_request_cannot_be_answered(jwt_client):
    admin, person = admin_and_person()
    old = age(ask(admin, person), minutes=6)
    expired = answer(jwt_client(person), old)
    assert expired.status_code == 409 and expired.json()['code'] == 'expired'

    other_admin, other_person = admin_and_person()
    done = ask(other_admin, other_person)
    client = jwt_client(other_person)
    answer(client, done, 'reject')
    again = answer(client, done)
    assert again.status_code == 409 and again.json()['code'] == 'already_answered'


# ── ending ────────────────────────────────────────────────────────────────────

def test_the_person_can_end_a_visit_at_once(jwt_client):
    admin, person = admin_and_person()
    _, access = acting(admin, person)
    response = jwt_client(person).post(f'{URL}/{access.pk}/end')
    assert response.status_code == 200
    access.refresh_from_db()
    assert (access.status, access.ended_by) == ('ended', 'person')
    assert UserSession.objects.get(support_access_id=access.pk).revoked_at is not None
    assert SecurityEvent.objects.filter(kind='support_ended').exists()


def test_ending_what_is_not_running_is_a_409(jwt_client):
    admin, person = admin_and_person()
    access = ask(admin, person)
    assert jwt_client(person).post(f'{URL}/{access.pk}/end').status_code == 409


# ── history ───────────────────────────────────────────────────────────────────

def test_history_lists_every_request_with_its_outcome_and_nobody_elses(jwt_client):
    person = UserFactory()
    first_admin, second_admin = UserFactory(role='ADMIN'), UserFactory(role='ADMIN')
    rejected = ask(first_admin, person)
    services.respond(rejected, person, allow=False, allow_edit=False)
    expired = age(ask(second_admin, person), minutes=6)
    other_admin, other_person = admin_and_person()
    ask(other_admin, other_person)

    rows = jwt_client(person).get(f'{URL}/history').json()['data']
    # Newest first. The lapsed one was asked six minutes ago, so it comes second.
    assert [(r['id'], r['status']) for r in rows] == [(rejected.pk, 'rejected'), (expired.pk, 'expired')]
    assert rows[1]['reason'] == REASON and rows[1]['admin']['name'] == second_admin.name
    assert SupportAccess.objects.count() == 3


def test_history_is_empty_for_a_person_nobody_asked_about(jwt_client):
    assert jwt_client(UserFactory()).get(f'{URL}/history').json()['data'] == []


# ── who may use these ─────────────────────────────────────────────────────────

@pytest.mark.parametrize('verb,path', [('get', '/pending'), ('get', '/history'), ('post', '/x/respond'), ('post', '/x/end')])
def test_an_admin_is_refused_all_four(jwt_client, verb, path):
    admin = UserFactory(role='ADMIN')
    assert getattr(jwt_client(admin), verb)(f'{URL}{path}').status_code == 403


def test_a_supervisor_may_be_asked_and_may_answer(jwt_client):
    admin, supervisor = admin_and_person('SUPERVISOR')
    access = ask(admin, supervisor)
    assert answer(jwt_client(supervisor), access).status_code == 200
