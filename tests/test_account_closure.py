"""A farmer closes their own account: they type their email and give the password, and the account is scheduled to be
removed thirty days on. Until then it can reach nothing but its own closure screen, and one click brings it back.

Asking signs every other device out, takes back what the farmer had open (egg requests, a cooperative request, an email
change) and emails the date. Supervisors and admins do not close their own account here: the SSMS team does it for them.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.conf import settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from cooperatives.models import CooperativeChangeRequest
from core.doc_text import t
from farms.models import RearingRoom
from logs.models import SecurityEvent
from supply.models import EggRequest, SupplyRound
from tests.factories import CooperativeFactory, FarmFactory, UserFactory
from users import closure
from users.models import EmailChange, UserSession

pytestmark = pytest.mark.django_db

DELETE = '/api/auth/delete-account'
CANCEL = f'{DELETE}/cancel'
ME = '/api/auth/me'
PASSWORD = 'Garden-Tree-4721'
EMAIL = 'aline@example.rw'


@pytest.fixture
def sent(monkeypatch):
    """Every email the code tried to send, as (subject, recipients, text)."""
    mails = []
    monkeypatch.setattr('users.closure.send_email_async', lambda subject, to, email, **kw: mails.append((subject, to, email.plain())))
    return mails


@pytest.fixture
def coop():
    return CooperativeFactory(name='Old Coop')


@pytest.fixture
def farmer(coop):
    return UserFactory(email=EMAIL, password=PASSWORD, cooperative=coop, name='Aline Uwase')


def open_session(user):
    now = timezone.now()
    return UserSession.objects.create(user=user, last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now))


def client_for(user, session=None):
    """A client that signs in with a real token of the given session, the way a browser does."""
    token = AccessToken.for_user(user)
    if session is not None:
        token['sid'] = session.id
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


def close(client, **over):
    return client.post(DELETE, {'confirmEmail': EMAIL, 'password': PASSWORD, **over}, format='json')


def code(response):
    return response.json().get('code')


def open_egg_request(farmer, coop, status=EggRequest.Status.SUBMITTED):
    room = RearingRoom.objects.create(farm=FarmFactory(owner=farmer), name='Room A', area_m2=Decimal('20'))
    when = timezone.now()
    rnd = SupplyRound.objects.create(
        cooperative=coop, name='Round', status='open', stock_boxes=10, request_deadline=when + timedelta(days=3),
        delivery_date=(when + timedelta(days=7)).date(), delivery_place='Store',
        expected_harvest_date=(when + timedelta(days=40)).date(), created_by=UserFactory(role='SUPERVISOR', cooperative=coop),
    )
    return EggRequest.objects.create(round=rnd, farmer=farmer, farm=room.farm, room=room, boxes_asked=1, status=status)


# ── asking ───────────────────────────────────────────────────────────────────────────────────

def test_a_farmer_can_ask_with_the_typed_email_and_the_password(jwt_client, farmer, sent):
    before = timezone.now()
    response = close(jwt_client(farmer))
    assert response.status_code == 200, response.content
    farmer.refresh_from_db()
    assert farmer.deletion_requested_at is not None and farmer.deletion_requested_at >= before
    expected = (farmer.deletion_requested_at + timedelta(days=settings.ACCOUNT_DELETION_GRACE_DAYS)).date().isoformat()
    assert response.json()['data']['deletionDate'] == expected
    assert settings.ACCOUNT_DELETION_GRACE_DAYS == 30
    assert farmer.is_active


@pytest.mark.parametrize('typed', ['', '   ', None, 'bruce@example.rw'])
def test_a_wrong_typed_email_changes_nothing(jwt_client, farmer, sent, typed):
    response = close(jwt_client(farmer), confirmEmail=typed)
    assert response.status_code == 422
    assert code(response) == 'confirm_mismatch'
    assert response.json()['errors']['confirmEmail'][0] == t('en', 'erConfirmTyped')
    farmer.refresh_from_db()
    assert farmer.deletion_requested_at is None and not sent


@pytest.mark.parametrize('password', ['', None, 'wrong-password-1'])
def test_a_wrong_password_changes_nothing(jwt_client, farmer, sent, password):
    response = close(jwt_client(farmer), password=password)
    assert response.status_code == 422
    assert code(response) == 'wrong_password'
    assert response.json()['errors']['password'][0] == t('en', 'erWrongPassword')
    farmer.refresh_from_db()
    assert farmer.deletion_requested_at is None and not sent


def test_the_typed_email_is_accepted_in_any_case_and_with_spaces(jwt_client, farmer, sent):
    assert close(jwt_client(farmer), confirmEmail=f'  {EMAIL.upper()} ').status_code == 200


@pytest.mark.parametrize('role', ['SUPERVISOR', 'ADMIN'])
def test_a_supervisor_and_an_admin_are_refused_with_deletion_not_for_staff_and_the_SSMS_team_sentence(jwt_client, coop, sent, role):
    person = UserFactory(email=EMAIL, password=PASSWORD, role=role, cooperative=coop if role == 'SUPERVISOR' else None)
    response = close(jwt_client(person))
    assert response.status_code == 403
    assert code(response) == 'deletion_not_for_staff'
    assert response.json()['message'] == t('en', 'erDeletionNotForStaff')
    assert 'SSMS team' in response.json()['message']
    person.refresh_from_db()
    assert person.deletion_requested_at is None and not sent


def test_asking_ends_every_other_session_and_keeps_this_one_for_the_gate_screen(farmer, sent):
    this_one, other, third = open_session(farmer), open_session(farmer), open_session(farmer)
    client = client_for(farmer, this_one)
    assert close(client).status_code == 200
    for session in (this_one, other, third):
        session.refresh_from_db()
    assert this_one.revoked_at is None
    assert other.revoked_at is not None and third.revoked_at is not None
    assert other.revoked_reason == 'deletion_scheduled'
    # The kept session can still say who it is, and nothing else.
    assert client.get(ME).status_code == 200
    stopped = client.get('/api/farms')
    assert stopped.status_code == 403 and code(stopped) == 'deletion_scheduled'


def test_asking_cancels_open_egg_requests_the_open_cooperative_request_and_a_pending_email_change(jwt_client, farmer, coop, sent):
    waiting = open_egg_request(farmer, coop)
    received = open_egg_request(farmer, coop, EggRequest.Status.RECEIVED)
    move = CooperativeChangeRequest.objects.create(user=farmer, from_cooperative=coop, to_cooperative=CooperativeFactory(), reason='Closer.')
    change = EmailChange.objects.create(user=farmer, old_email=EMAIL, new_email='new@example.rw')
    assert close(jwt_client(farmer)).status_code == 200
    for row in (waiting, received, move, change):
        row.refresh_from_db()
    assert waiting.status == EggRequest.Status.CANCELLED
    assert received.status == EggRequest.Status.RECEIVED
    assert move.status == CooperativeChangeRequest.Status.WITHDRAWN
    assert change.status == EmailChange.Status.CANCELLED


def test_asking_emails_the_removal_date_and_how_to_cancel(jwt_client, farmer, sent):
    assert close(jwt_client(farmer)).status_code == 200
    farmer.refresh_from_db()
    date = closure.removal_date(farmer)
    spoken = f'{date.day} {date:%B %Y}'
    assert len(sent) == 1
    subject, to, text = sent[0]
    assert subject == f'Your SSMS account will be removed on {spoken}'
    assert to == [EMAIL]
    assert spoken in text and 'Keep my account' in text
    assert PASSWORD not in text


def test_asking_twice_keeps_the_first_date_and_sends_one_email(farmer, sent):
    closure.request_closure(farmer)
    first = farmer.deletion_requested_at
    assert first is not None
    again = closure.request_closure(farmer)
    assert again.deletion_requested_at == first
    farmer.refresh_from_db()
    assert farmer.deletion_requested_at == first
    assert len(sent) == 1


def test_a_scheduled_account_cannot_ask_again_through_the_route(jwt_client, farmer, sent):
    client = jwt_client(farmer)
    assert close(client).status_code == 200
    again = close(client)
    assert again.status_code == 403 and code(again) == 'deletion_scheduled'


# ── taking it back ───────────────────────────────────────────────────────────────────────────

def test_cancel_clears_the_date_and_the_account_works_again(jwt_client, farmer, sent):
    client = jwt_client(farmer)
    close(client)
    assert client.get('/api/farms').status_code == 403
    response = client.post(CANCEL)
    assert response.status_code == 200, response.content
    farmer.refresh_from_db()
    assert farmer.deletion_requested_at is None
    assert client.get('/api/farms').status_code == 200
    assert client.get(ME).json()['data']['deletionDate'] is None


def test_cancel_on_an_account_that_is_not_scheduled_says_nothing_to_cancel(jwt_client, farmer):
    response = jwt_client(farmer).post(CANCEL)
    assert response.status_code == 404
    assert code(response) == 'deletion_nothing_to_cancel'
    assert response.json()['message'] == t('en', 'erDeletionNothingToCancel')


def test_the_me_route_shows_the_date_while_the_closure_is_scheduled(jwt_client, farmer, sent):
    client = jwt_client(farmer)
    assert client.get(ME).json()['data']['deletionDate'] is None
    close(client)
    farmer.refresh_from_db()
    expected = closure.removal_date(farmer).date().isoformat()
    assert client.get(ME).json()['data']['deletionDate'] == expected


# ── the log, the throttle and the SSMS team ─────────────────────────────────────────────────

def test_the_route_is_throttled_and_writes_security_events(jwt_client, farmer, sent):
    client = jwt_client(farmer)
    statuses = [close(client, password='wrong-password-1').status_code for _ in range(6)]
    assert statuses == [422] * 5 + [429]


def test_asking_and_cancelling_write_security_events_without_the_email(jwt_client, farmer, sent):
    client = jwt_client(farmer)
    close(client)
    client.post(CANCEL)
    events = SecurityEvent.objects.filter(kind__in=['deletion_scheduled', 'deletion_cancelled'])
    assert set(events.values_list('kind', flat=True)) == {'deletion_scheduled', 'deletion_cancelled'}
    for event in events:
        assert EMAIL not in event.detail


def test_the_admin_list_shows_the_date_and_the_restore_route_refuses_an_anonymised_account_with_409_anonymised(jwt_client, farmer, sent):
    admin = UserFactory(role='ADMIN')
    close(jwt_client(farmer))
    rows = {r['id']: r for r in jwt_client(admin).get('/api/admin/users').json()['data']}
    assert rows[farmer.pk]['deletionDate'] is not None
    assert rows[admin.pk]['deletionDate'] is None

    farmer.refresh_from_db()
    closure.anonymise(farmer)
    response = jwt_client(admin).post(f'/api/admin/users/{farmer.pk}/restore')
    assert response.status_code == 409
    assert code(response) == 'anonymised'
    farmer.refresh_from_db()
    assert not farmer.is_active


def test_the_new_texts_exist_in_three_languages():
    for key in ('erDeletionScheduled', 'erDeletionNotForStaff', 'erDeletionNothingToCancel', 'erAnonymised'):
        texts = {lang: t(lang, key) for lang in ('en', 'fr', 'rw')}
        assert all(texts.values()), key
        assert len(set(texts.values())) == 3, key
