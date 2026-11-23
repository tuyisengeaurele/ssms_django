"""A person changes their own email: ask with the typed current email and the password, open the link sent to the new
address, and the login email changes. The old address is told, with a link to undo it for seven days.

Nothing changes until the link is opened, every device is signed out when it is, and an undo also sends a password reset
link, because whoever changed the email knew the password.
"""
import re
from datetime import timedelta
from unittest import mock

import pytest
from django.core import mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from core.doc_text import t
from logs.models import SecurityEvent
from tests.factories import UserFactory
from tests.support_helpers import acting, admin_and_person
from users.email_change import make_token
from users.models import EmailChange, User, UserSession

pytestmark = pytest.mark.django_db

ASK = '/api/auth/email-change'
CONFIRM = f'{ASK}/confirm'
UNDO = f'{ASK}/undo'
PASSWORD = 'Garden-Tree-4721'
OLD = 'aline@example.rw'
NEW = 'new@example.rw'


@pytest.fixture
def person():
    return UserFactory(email=OLD, password=PASSWORD)


def ask(client, **over):
    body = {'newEmail': NEW, 'confirmEmail': OLD, 'password': PASSWORD, **over}
    return client.post(ASK, body, format='json')


def token_in(message, path):
    match = re.search(rf'{path}\?token=([\w\-:=]+)', message.body)
    assert match, message.body
    return match.group(1)


def open_session(user):
    now = timezone.now()
    return UserSession.objects.create(user=user, last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now))


def pending(user):
    return EmailChange.objects.get(user=user, status='pending')


def confirmed(person, jwt_client):
    """Asks and opens the link. Returns the change."""
    assert ask(jwt_client(person)).status_code == 201
    token = token_in(mail.outbox[0], 'confirm-email-change')
    response = APIClient().post(CONFIRM, {'token': token}, format='json')
    assert response.status_code == 200, response.content
    return EmailChange.objects.get(user=person)


# ── asking ───────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('typed', ['', '   ', None, 'bruce@example.rw', 'aline@example'])
def test_asking_needs_the_typed_current_email(jwt_client, person, typed):
    response = ask(jwt_client(person), confirmEmail=typed)
    assert response.status_code == 422
    assert response.json()['code'] == 'confirm_mismatch'
    assert response.json()['errors']['confirmEmail'][0] == t('en', 'erConfirmTyped')
    assert not EmailChange.objects.exists() and not mail.outbox


@pytest.mark.parametrize('typed', [OLD, 'ALINE@EXAMPLE.RW', f'  {OLD}  '])
def test_the_typed_email_is_accepted_in_any_case_and_with_spaces(jwt_client, person, typed):
    assert ask(jwt_client(person), confirmEmail=typed).status_code == 201


@pytest.mark.parametrize('password', ['', None, 'wrong-password-1'])
def test_asking_needs_the_password(jwt_client, person, password):
    response = ask(jwt_client(person), password=password)
    assert response.status_code == 422
    assert response.json()['code'] == 'wrong_password'
    assert response.json()['errors']['password'][0] == t('en', 'erWrongPassword')
    assert not EmailChange.objects.exists() and not mail.outbox


def test_a_bad_new_address_is_refused_beside_its_field(jwt_client, person):
    response = ask(jwt_client(person), newEmail='not-an-email')
    assert response.status_code == 422
    assert 'newEmail' in response.json()['errors']
    assert not EmailChange.objects.exists()


def test_the_same_address_is_refused_in_any_case(jwt_client, person):
    response = ask(jwt_client(person), newEmail='ALINE@example.rw')
    assert response.status_code == 422
    assert response.json()['code'] == 'email_same'
    assert response.json()['errors']['newEmail'][0] == t('en', 'erEmailSame')


@pytest.mark.parametrize('written', [NEW, 'NEW@Example.rw', ' new@example.rw '])
def test_an_address_another_account_holds_is_refused_in_any_case(jwt_client, person, written):
    UserFactory(email=NEW)
    response = ask(jwt_client(person), newEmail=written)
    assert response.status_code == 422
    assert response.json()['code'] == 'email_taken'
    assert response.json()['errors']['newEmail'][0] == t('en', 'erEmailTaken')
    assert not EmailChange.objects.exists()


def test_a_valid_request_makes_one_pending_row_and_sends_a_link_to_the_new_address_and_a_notice_to_the_old(jwt_client, person):
    response = ask(jwt_client(person))
    assert response.status_code == 201
    change = pending(person)
    assert (change.old_email, change.new_email) == (OLD, NEW)
    assert [m.to for m in mail.outbox] == [[NEW], [OLD]]
    link, notice = mail.outbox
    assert 'confirm-email-change?token=' in link.body
    assert 'nothing changes' in notice.body.lower()
    assert 'n***@example.rw' in notice.body
    assert NEW not in notice.body
    data = response.json()['data']
    assert data['newEmail'] == 'n***@example.rw'


def test_the_login_email_does_not_change_until_the_link_is_opened(jwt_client, person):
    ask(jwt_client(person))
    person.refresh_from_db()
    assert person.email == OLD


def test_a_new_request_cancels_the_older_one_and_only_the_newest_link_works(jwt_client, person):
    client = jwt_client(person)
    ask(client)
    first_token = token_in(mail.outbox[0], 'confirm-email-change')
    ask(client, newEmail='other@example.rw')
    assert EmailChange.objects.filter(user=person, status='cancelled').count() == 1
    assert pending(person).new_email == 'other@example.rw'
    refused = APIClient().post(CONFIRM, {'token': first_token}, format='json')
    assert refused.status_code == 400 and refused.json()['code'] == 'link_used'
    person.refresh_from_db()
    assert person.email == OLD


def test_the_database_allows_one_pending_change_per_person(person):
    EmailChange.objects.create(user=person, old_email=OLD, new_email=NEW)
    with pytest.raises(IntegrityError), transaction.atomic():
        EmailChange.objects.create(user=person, old_email=OLD, new_email='other@example.rw')


def test_a_link_that_could_not_be_sent_leaves_nothing_pending(jwt_client, person):
    with mock.patch('users.email_change.send_email', side_effect=RuntimeError('smtp down')):
        response = ask(jwt_client(person))
    assert response.status_code == 422
    assert response.json()['code'] == 'email_not_sent'
    assert not EmailChange.objects.exists()


def test_a_failed_notice_to_the_old_address_does_not_stop_the_request(jwt_client, person):
    with mock.patch('users.email_change.send_email_async', side_effect=RuntimeError('smtp down')):
        response = ask(jwt_client(person))
    assert response.status_code == 201
    assert pending(person)


def test_the_refusals_are_written_in_the_language_asked_for(jwt_client, person):
    response = jwt_client(person).post(
        ASK, {'newEmail': NEW, 'confirmEmail': OLD, 'password': 'nope'}, format='json', HTTP_ACCEPT_LANGUAGE='fr',
    )
    assert response.json()['errors']['password'][0] == t('fr', 'erWrongPassword')


# ── seeing and cancelling ────────────────────────────────────────────────────────────────────

def test_get_gives_null_when_nothing_is_pending_and_the_masked_address_when_it_is(jwt_client, person):
    client = jwt_client(person)
    assert client.get(ASK).json()['data'] is None
    ask(client)
    data = client.get(ASK).json()['data']
    assert data['newEmail'] == 'n***@example.rw'
    assert NEW not in str(data)


def test_cancel_removes_the_pending_change_and_a_second_cancel_says_there_is_nothing(jwt_client, person):
    client = jwt_client(person)
    ask(client)
    assert client.delete(ASK).status_code == 200
    assert EmailChange.objects.get(user=person).status == 'cancelled'
    again = client.delete(ASK)
    assert again.status_code == 404 and again.json()['code'] == 'nothing_to_cancel'


def test_a_cancelled_change_cannot_be_confirmed(jwt_client, person):
    client = jwt_client(person)
    ask(client)
    token = token_in(mail.outbox[0], 'confirm-email-change')
    client.delete(ASK)
    response = APIClient().post(CONFIRM, {'token': token}, format='json')
    assert response.status_code == 400 and response.json()['code'] == 'link_used'


def test_nobody_else_sees_or_cancels_a_pending_change(jwt_client, person):
    ask(jwt_client(person))
    other = jwt_client(UserFactory())
    assert other.get(ASK).json()['data'] is None
    assert other.delete(ASK).status_code == 404
    assert pending(person)


# ── opening the link ─────────────────────────────────────────────────────────────────────────

def test_confirming_switches_the_email_ends_every_session_and_tells_the_old_address_with_an_undo_link(jwt_client, person):
    sessions = [open_session(person), open_session(person)]
    change = confirmed(person, jwt_client)
    person.refresh_from_db()
    assert person.email == NEW
    assert change.status == 'done' and change.confirmed_at is not None
    for session in sessions:
        session.refresh_from_db()
        assert session.revoked_at is not None
    undo_mail = mail.outbox[-1]
    assert undo_mail.to == [OLD]
    assert 'undo-email-change?token=' in undo_mail.body


def test_the_person_can_sign_in_with_the_new_address_and_not_the_old(jwt_client, person):
    confirmed(person, jwt_client)
    client = APIClient()
    assert client.post('/api/auth/login', {'email': OLD, 'password': PASSWORD}, format='json').status_code == 401
    assert client.post('/api/auth/login', {'email': NEW, 'password': PASSWORD}, format='json').status_code == 200


def test_the_new_address_stays_verified(jwt_client, person):
    confirmed(person, jwt_client)
    person.refresh_from_db()
    assert person.is_email_verified is True


@pytest.mark.parametrize('token', ['', 'nonsense', 'a:b:c'])
def test_a_missing_or_nonsense_token_is_refused(token):
    response = APIClient().post(CONFIRM, {'token': token}, format='json')
    assert response.status_code == 400 and response.json()['code'] == 'link_invalid'


def test_a_tampered_token_is_refused(jwt_client, person):
    ask(jwt_client(person))
    token = token_in(mail.outbox[0], 'confirm-email-change')
    response = APIClient().post(CONFIRM, {'token': token[:-2] + 'xx'}, format='json')
    assert response.status_code == 400 and response.json()['code'] == 'link_invalid'


def test_a_link_for_undoing_cannot_confirm_and_the_other_way_round(jwt_client, person):
    change = confirmed(person, jwt_client)
    undo_token = make_token(change, 'undo')
    assert APIClient().post(CONFIRM, {'token': undo_token}, format='json').json()['code'] == 'link_invalid'
    assert APIClient().post(UNDO, {'token': make_token(change, 'confirm')}, format='json').json()['code'] == 'link_invalid'


def test_a_confirm_link_expires_after_a_day(jwt_client, person):
    ask(jwt_client(person))
    token = token_in(mail.outbox[0], 'confirm-email-change')
    EmailChange.objects.filter(user=person).update(created_at=timezone.now() - timedelta(hours=25))
    response = APIClient().post(CONFIRM, {'token': token}, format='json')
    assert response.status_code == 400 and response.json()['code'] == 'link_expired'
    person.refresh_from_db()
    assert person.email == OLD


def test_a_link_cannot_be_used_twice(jwt_client, person):
    ask(jwt_client(person))
    token = token_in(mail.outbox[0], 'confirm-email-change')
    assert APIClient().post(CONFIRM, {'token': token}, format='json').status_code == 200
    again = APIClient().post(CONFIRM, {'token': token}, format='json')
    assert again.status_code == 400 and again.json()['code'] == 'link_used'


def test_confirming_is_refused_when_the_address_was_taken_meanwhile_and_the_change_stays_pending(jwt_client, person):
    ask(jwt_client(person))
    token = token_in(mail.outbox[0], 'confirm-email-change')
    UserFactory(email=NEW)
    response = APIClient().post(CONFIRM, {'token': token}, format='json')
    assert response.status_code == 422 and response.json()['code'] == 'email_taken'
    person.refresh_from_db()
    assert person.email == OLD
    assert pending(person)


def test_a_race_on_the_unique_email_is_mapped_to_email_taken(jwt_client, person):
    ask(jwt_client(person))
    token = token_in(mail.outbox[0], 'confirm-email-change')
    UserFactory(email=NEW)
    # The friendly check sees nothing, as it would if the other account had not been saved yet. The database refuses.
    with mock.patch('users.email_change._email_taken', return_value=False):
        response = APIClient().post(CONFIRM, {'token': token}, format='json')
    assert response.status_code == 422 and response.json()['code'] == 'email_taken'
    person.refresh_from_db()
    assert person.email == OLD
    assert pending(person)


def test_a_failed_undo_mail_does_not_stop_the_change(jwt_client, person):
    ask(jwt_client(person))
    token = token_in(mail.outbox[0], 'confirm-email-change')
    with mock.patch('users.email_change.send_email_async', side_effect=RuntimeError('smtp down')):
        response = APIClient().post(CONFIRM, {'token': token}, format='json')
    assert response.status_code == 200
    person.refresh_from_db()
    assert person.email == NEW


# ── undoing ──────────────────────────────────────────────────────────────────────────────────

def test_undo_restores_the_old_email_ends_every_session_and_sends_a_password_reset_link_to_it(jwt_client, person):
    change = confirmed(person, jwt_client)
    undo_token = token_in(mail.outbox[-1], 'undo-email-change')
    sessions = [open_session(person)]
    mail.outbox.clear()
    response = APIClient().post(UNDO, {'token': undo_token}, format='json')
    assert response.status_code == 200, response.content
    person.refresh_from_db()
    assert person.email == OLD
    change.refresh_from_db()
    assert change.status == 'undone'
    sessions[0].refresh_from_db()
    assert sessions[0].revoked_at is not None
    assert [m.to for m in mail.outbox] == [[OLD]]
    assert 'reset-password?uid=' in mail.outbox[0].body


def test_undo_is_refused_after_seven_days(jwt_client, person):
    confirmed(person, jwt_client)
    undo_token = token_in(mail.outbox[-1], 'undo-email-change')
    EmailChange.objects.filter(user=person).update(confirmed_at=timezone.now() - timedelta(days=8))
    response = APIClient().post(UNDO, {'token': undo_token}, format='json')
    assert response.status_code == 400 and response.json()['code'] == 'link_expired'
    person.refresh_from_db()
    assert person.email == NEW


def test_undo_cannot_be_used_twice(jwt_client, person):
    confirmed(person, jwt_client)
    undo_token = token_in(mail.outbox[-1], 'undo-email-change')
    assert APIClient().post(UNDO, {'token': undo_token}, format='json').status_code == 200
    again = APIClient().post(UNDO, {'token': undo_token}, format='json')
    assert again.status_code == 400 and again.json()['code'] == 'link_used'


def test_undo_is_refused_when_the_old_address_has_been_taken_since(jwt_client, person):
    confirmed(person, jwt_client)
    undo_token = token_in(mail.outbox[-1], 'undo-email-change')
    UserFactory(email=OLD)
    response = APIClient().post(UNDO, {'token': undo_token}, format='json')
    assert response.status_code == 422 and response.json()['code'] == 'undo_blocked'
    person.refresh_from_db()
    assert person.email == NEW


def test_undo_on_a_change_that_was_never_confirmed_is_refused(jwt_client, person):
    ask(jwt_client(person))
    change = pending(person)
    response = APIClient().post(UNDO, {'token': make_token(change, 'undo')}, format='json')
    assert response.status_code == 400 and response.json()['code'] == 'link_used'


# ── who may do it ────────────────────────────────────────────────────────────────────────────

def test_an_admin_needs_a_recent_authenticator_code(jwt_client):
    admin = UserFactory(role='ADMIN', email=OLD, password=PASSWORD)
    client = jwt_client(admin)
    UserSession.objects.filter(user=admin).update(mfa_verified_at=timezone.now() - timedelta(hours=1))
    stale = ask(client)
    assert stale.status_code == 403 and stale.json()['code'] == 'mfa_recent_required'
    assert not EmailChange.objects.exists()
    UserSession.objects.filter(user=admin).update(mfa_verified_at=timezone.now())
    assert ask(client).status_code == 201


def test_an_unauthenticated_visitor_cannot_ask_see_or_cancel():
    client = APIClient()
    assert client.post(ASK, {}, format='json').status_code == 401
    assert client.get(ASK).status_code == 401
    assert client.delete(ASK).status_code == 401


def test_support_access_cannot_use_these_routes():
    admin, person = admin_and_person()
    token, _ = acting(admin, person)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    for response in (ask(client), client.get(ASK), client.delete(ASK)):
        assert response.status_code == 403
        assert response.json()['code'] == 'support_blocked'


# ── throttle and log ─────────────────────────────────────────────────────────────────────────

def test_asking_is_throttled_to_five_a_minute(jwt_client, person):
    client = jwt_client(person)
    codes = [ask(client, password='wrong-password-1').status_code for _ in range(6)]
    assert codes == [422] * 5 + [429]


def test_looking_at_the_pending_change_does_not_spend_the_allowance(jwt_client, person):
    client = jwt_client(person)
    assert all(client.get(ASK).status_code == 200 for _ in range(8))
    assert ask(client).status_code == 201


def test_each_step_writes_a_security_event_with_masked_addresses(jwt_client, person):
    confirmed(person, jwt_client)
    APIClient().post(UNDO, {'token': token_in(mail.outbox[-1], 'undo-email-change')}, format='json')
    events = SecurityEvent.objects.filter(kind__in=['email_change_asked', 'email_changed', 'email_change_undone'])
    assert set(events.values_list('kind', flat=True)) == {'email_change_asked', 'email_changed', 'email_change_undone'}
    for event in events:
        assert OLD not in event.detail and NEW not in event.detail, event.kind
        assert 'a***@example.rw' in event.detail or 'n***@example.rw' in event.detail


def test_a_person_with_no_phone_number_can_still_use_a_link_because_the_link_is_public():
    # The link is opened in a browser that may hold no sign in at all, and it never needs one.
    person = UserFactory(email=OLD, phone=None)
    change = EmailChange.objects.create(user=person, old_email=OLD, new_email=NEW)
    response = APIClient().post(CONFIRM, {'token': make_token(change, 'confirm')}, format='json')
    assert response.status_code == 200
    assert User.objects.get(pk=person.pk).email == NEW


def test_the_new_texts_exist_in_three_languages():
    for key in ('erEmailSame', 'erLinkInvalid', 'erLinkExpired', 'erLinkUsed', 'erEmailNotSent', 'erNothingToCancel', 'erUndoBlocked'):
        texts = {lang: t(lang, key) for lang in ('en', 'fr', 'rw')}
        assert all(texts.values()), key
        assert len(set(texts.values())) == 3, key
