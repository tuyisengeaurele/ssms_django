"""The admin side of support access: asking, waiting, starting and ending. The person's side is in test_support_person_api."""
from datetime import timedelta

import pytest
from django.utils import timezone

from audit_log.models import AuditLog
from logs.models import SecurityEvent
from support_access import services
from support_access.models import SupportAccess
from tests.factories import UserFactory
from tests.support_helpers import REASON, acting, admin_and_person
from users.models import UserSession

pytestmark = pytest.mark.django_db

URL = '/api/support-access'


def body(person, **over):
    return {'personId': person.pk, 'reason': REASON, 'minutes': 30, 'mode': 'view', **over}


@pytest.fixture
def sent(monkeypatch):
    """Every email the view tried to send, as (subject, recipients, Email)."""
    mails = []
    monkeypatch.setattr('support_access.views.send_email_async', lambda subject, to, email, **kw: mails.append((subject, to, email)))
    return mails


def allowed(admin, person, **over):
    access = services.ask(admin, person, reason=REASON, minutes=over.get('minutes', 30), mode=over.get('mode', 'view'))
    return services.respond(access, person, allow=True, allow_edit=True)


def stale_code(admin, minutes=11):
    UserSession.objects.filter(user=admin).update(mfa_verified_at=timezone.now() - timedelta(minutes=minutes))


# ── asking ────────────────────────────────────────────────────────────────────

def test_a_valid_request_is_created_and_the_person_is_emailed_once(jwt_client, sent):
    admin, person = admin_and_person()
    response = jwt_client(admin).post(URL, body(person), format='json')

    assert response.status_code == 201, response.content
    row = response.json()['data']
    assert row['status'] == 'requested' and row['person'] == {'id': person.pk, 'name': person.name}
    assert row['requestedMode'] == 'view' and row['minutes'] == 30 and row['reason'] == REASON

    assert len(sent) == 1
    _, recipients, email = sent[0]
    assert recipients == [person.email]
    assert email.button is None, 'only a signed in person may answer, so the email carries no link that approves'
    assert REASON in email.plain() and REASON in email.html()


def test_the_reason_is_escaped_in_the_email(jwt_client, sent):
    admin, person = admin_and_person()
    reason = '<script>alert(1)</script> please look at my batch'
    assert jwt_client(admin).post(URL, body(person, reason=reason), format='json').status_code == 201
    html = sent[0][2].html()
    assert '&lt;script&gt;' in html and '<script>' not in html


def test_a_request_needs_a_recent_code(jwt_client, sent):
    admin, person = admin_and_person()
    client = jwt_client(admin)
    stale_code(admin)
    response = client.post(URL, body(person), format='json')
    assert response.status_code == 403 and response.json()['code'] == 'mfa_recent_required'
    assert SupportAccess.objects.count() == 0 and sent == []


@pytest.mark.parametrize('over', [
    {'reason': 'too short'}, {'reason': 'x' * 301}, {'minutes': 20}, {'minutes': 'soon'}, {'mode': 'x'},
])
def test_bad_input_is_refused(jwt_client, sent, over):
    admin, person = admin_and_person()
    response = jwt_client(admin).post(URL, body(person, **over), format='json')
    assert response.status_code == 400
    assert SupportAccess.objects.count() == 0 and sent == []


@pytest.mark.parametrize('target', ['admin', 'self', 'inactive', 'unknown'])
def test_the_wrong_people_are_refused(jwt_client, sent, target):
    admin = UserFactory(role='ADMIN')
    person = {'admin': lambda: UserFactory(role='ADMIN'), 'self': lambda: admin,
              'inactive': lambda: UserFactory(is_active=False), 'unknown': lambda: None}[target]()
    data = body(person) if person else {**body(admin), 'personId': 'nobody'}
    response = jwt_client(admin).post(URL, data, format='json')
    assert response.status_code in (400, 404)
    assert SupportAccess.objects.count() == 0 and sent == []


def test_a_farmer_cannot_ask(jwt_client, sent):
    farmer, other = UserFactory(), UserFactory()
    assert jwt_client(farmer).post(URL, body(other), format='json').status_code == 403


def test_a_second_open_request_is_refused_with_409(jwt_client, sent):
    admin, person = admin_and_person()
    client = jwt_client(admin)
    assert client.post(URL, body(person), format='json').status_code == 201
    assert client.post(URL, body(UserFactory()), format='json').status_code == 409
    other_admin = UserFactory(role='ADMIN')
    assert jwt_client(other_admin).post(URL, body(person), format='json').status_code == 409


def test_two_requests_racing_give_a_409_and_not_a_500(jwt_client, sent, monkeypatch):
    admin, person = admin_and_person()
    services.ask(UserFactory(role='ADMIN'), person, reason=REASON, minutes=30, mode='view')
    # The check finds nothing, as it would for a request that lands between the check and the save.
    monkeypatch.setattr('support_access.services.open_request_of', lambda p: None)
    response = jwt_client(admin).post(URL, body(person), format='json')
    assert response.status_code == 409 and response.json()['code'] == 'person_busy'
    assert sent == []


@pytest.mark.throttle
def test_the_sixth_request_in_an_hour_is_slowed_down(jwt_client, sent):
    admin = UserFactory(role='ADMIN')
    client = jwt_client(admin)
    for _ in range(5):
        made = client.post(URL, body(UserFactory()), format='json')
        assert made.status_code == 201
        assert client.post(f'{URL}/{made.json()["data"]["id"]}/cancel').status_code == 200
    assert client.post(URL, body(UserFactory()), format='json').status_code == 429


# ── reading, waiting, cancelling ──────────────────────────────────────────────

def test_the_admin_reads_only_their_own_requests(jwt_client):
    admin, person = admin_and_person()
    access = allowed(admin, person)
    other = jwt_client(UserFactory(role='ADMIN'))
    assert other.get(f'{URL}/{access.pk}').status_code == 404
    for verb in ('cancel', 'start', 'token', 'end'):
        assert other.post(f'{URL}/{access.pk}/{verb}').status_code == 404, verb


def test_the_admin_can_poll_a_request(jwt_client):
    admin, person = admin_and_person()
    access = services.ask(admin, person, reason=REASON, minutes=15, mode='edit')
    client = jwt_client(admin)
    assert client.get(f'{URL}/{access.pk}').json()['data']['status'] == 'requested'
    services.respond(access, person, allow=True, allow_edit=False)
    row = client.get(f'{URL}/{access.pk}').json()['data']
    assert row['status'] == 'approved' and row['grantedMode'] == 'view'


def test_mine_gives_the_open_request_and_the_recent_ones(jwt_client):
    admin, person = admin_and_person()
    services.cancel(services.ask(admin, person, reason=REASON, minutes=15, mode='view'), admin)
    open_one = services.ask(admin, UserFactory(), reason=REASON, minutes=15, mode='view')
    data = jwt_client(admin).get(f'{URL}/mine').json()['data']
    assert data['open']['id'] == open_one.pk
    assert [r['status'] for r in data['recent']] == ['requested', 'cancelled']


def test_mine_has_no_open_request_when_there_is_none(jwt_client):
    admin = UserFactory(role='ADMIN')
    assert jwt_client(admin).get(f'{URL}/mine').json()['data'] == {'open': None, 'recent': []}


def test_cancel_closes_a_waiting_or_allowed_request(jwt_client):
    admin, person = admin_and_person()
    waiting = services.ask(admin, person, reason=REASON, minutes=15, mode='view')
    assert jwt_client(admin).post(f'{URL}/{waiting.pk}/cancel').json()['data']['status'] == 'cancelled'


def test_cancel_refuses_a_running_visit(jwt_client):
    admin, person = admin_and_person()
    _, access = acting(admin, person)
    assert jwt_client(admin).post(f'{URL}/{access.pk}/cancel').status_code == 409


# ── starting, the token, ending ───────────────────────────────────────────────

def test_start_gives_a_token_for_an_allowed_request(jwt_client):
    admin, person = admin_and_person()
    access = allowed(admin, person)
    response = jwt_client(admin).post(f'{URL}/{access.pk}/start')
    assert response.status_code == 200, response.content
    data = response.json()['data']
    assert data['access']['status'] == 'active' and data['token']
    assert UserSession.objects.filter(support_access_id=access.pk, user=person).exists()


def test_start_before_the_answer_is_a_409(jwt_client):
    admin, person = admin_and_person()
    access = services.ask(admin, person, reason=REASON, minutes=15, mode='view')
    assert jwt_client(admin).post(f'{URL}/{access.pk}/start').status_code == 409


def test_start_needs_a_recent_code(jwt_client):
    admin, person = admin_and_person()
    access = allowed(admin, person)
    client = jwt_client(admin)
    stale_code(admin)
    response = client.post(f'{URL}/{access.pk}/start')
    assert response.status_code == 403 and response.json()['code'] == 'mfa_recent_required'


def test_the_token_can_be_made_again_only_while_the_visit_runs(jwt_client):
    admin, person = admin_and_person()
    _, access = acting(admin, person)
    client = jwt_client(admin)
    assert client.post(f'{URL}/{access.pk}/token').json()['data']['token']
    services.end_support_access(access, 'person', 'person_ended')
    assert client.post(f'{URL}/{access.pk}/token').status_code == 409


def test_the_admin_can_end_a_visit(jwt_client):
    admin, person = admin_and_person()
    _, access = acting(admin, person)
    response = jwt_client(admin).post(f'{URL}/{access.pk}/end')
    assert response.status_code == 200
    access.refresh_from_db()
    assert (access.status, access.ended_by) == ('ended', 'admin')


# ── what is recorded ──────────────────────────────────────────────────────────

def test_the_story_is_in_the_security_events_and_the_audit_log_without_any_secret(jwt_client):
    admin, person = admin_and_person()
    client = jwt_client(admin)
    made = client.post(URL, body(person), format='json').json()['data']
    services.respond(SupportAccess.objects.get(pk=made['id']), person, allow=True, allow_edit=False)
    token = client.post(f'{URL}/{made["id"]}/start').json()['data']['token']
    client.post(f'{URL}/{made["id"]}/end')

    kinds = set(SecurityEvent.objects.values_list('kind', flat=True))
    assert {'support_requested', 'support_started', 'support_ended'} <= kinds
    assert AuditLog.objects.filter(resource='SupportAccess', resource_id=made['id']).count() >= 3

    seen = ' '.join(SecurityEvent.objects.values_list('detail', flat=True)) + ' '.join(AuditLog.objects.values_list('detail', flat=True))
    assert token not in seen and 'Bearer' not in seen
