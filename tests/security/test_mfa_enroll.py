"""Turning two-step sign in on from inside the app: the password, then a code from the new secret.

Secrets, codes and recovery codes are made at run time. None of them reaches a log, an event, the audit log or an email.
"""
from unittest import mock

import pyotp
import pytest
from django.core import mail
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from core import lockout, mail_words, throttles
from logs.models import SecurityEvent
from tests.factories import UserFactory
from tests.mfa_helpers import PASSWORD, client_with, enable_factor, session_for, totp
from tests.support_helpers import acting, admin_and_person
from users import mfa
from users.cookie_utils import REFRESH_COOKIE
from users.models import RecoveryCode, SecondFactor, UserSession

pytestmark = pytest.mark.django_db

START = '/api/auth/mfa/enroll/start'
CONFIRM = '/api/auth/mfa/enroll/confirm'
NEW_CODES = '/api/auth/mfa/recovery-codes'
ME = '/api/auth/me'
LOGIN = '/api/auth/login'


def signed_in(user):
    session = session_for(user)
    return client_with(user, session), session


def start(client, password=PASSWORD):
    return client.post(START, {'password': password}, format='json')


def confirm(client, code):
    return client.post(CONFIRM, {'code': code}, format='json')


def turned_on(user=None):
    """The whole way. Returns the client, its session, the secret and the recovery codes."""
    user = user or UserFactory(role='FARMER')
    client, session = signed_in(user)
    secret = start(client).data['data']['secret']
    response = confirm(client, totp(secret))
    assert response.status_code == 200, response.data
    return client, session, secret, response.data['data']['recovery_codes']


def wrong_code(secret):
    return '000000' if totp(secret) != '000000' else '111111'


# ── the password step ───────────────────────────────────────────────────────────────────────

def test_a_wrong_password_is_refused_and_counted():
    user = UserFactory(role='FARMER')
    client, _ = signed_in(user)
    first = start(client, 'not-the-password')
    assert first.status_code == 422 and first.data['code'] == 'wrong_password'
    for _ in range(4):
        last = start(client, 'not-the-password')
    assert last.status_code == 429 and lockout.is_locked(user.email)
    assert start(client).status_code == 429
    assert not SecondFactor.objects.filter(user=user).exclude(pending_secret_encrypted='').exists()


def test_a_missing_password_is_refused():
    client, _ = signed_in(UserFactory(role='FARMER'))
    assert client.post(START, {}, format='json').status_code == 422


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_start_gives_a_secret_that_is_stored_encrypted(role):
    user = UserFactory(role=role)
    client, _ = signed_in(user)
    data = start(client).data['data']
    assert data['otpauth_uri'].startswith('otpauth://totp/')
    stored = SecondFactor.objects.get(user=user)
    assert stored.enabled_at is None and data['secret'] not in stored.pending_secret_encrypted
    assert mfa.decrypt(stored.pending_secret_encrypted) == data['secret']


def test_starting_twice_replaces_the_pending_secret():
    user = UserFactory(role='FARMER')
    client, _ = signed_in(user)
    first, second = start(client).data['data']['secret'], start(client).data['data']['secret']
    assert first != second and confirm(client, totp(first)).status_code == 422
    assert confirm(client, totp(second)).status_code == 200


# ── the code step ───────────────────────────────────────────────────────────────────────────

def test_a_wrong_code_leaves_it_off():
    user = UserFactory(role='FARMER')
    client, _ = signed_in(user)
    secret = start(client).data['data']['secret']
    response = confirm(client, wrong_code(secret))
    assert response.status_code == 422 and response.data['code'] == 'mfa_wrong_code'
    assert not mfa.is_enabled(user) and not RecoveryCode.objects.filter(user=user).exists()


def test_confirm_without_start_asks_to_start_again():
    client, _ = signed_in(UserFactory(role='FARMER'))
    response = confirm(client, '123456')
    assert response.status_code == 409 and response.data['code'] == 'mfa_start_again'


def test_a_good_code_turns_it_on():
    user = UserFactory(role='FARMER')
    client, session = signed_in(user)
    secret = start(client).data['data']['secret']
    response = confirm(client, totp(secret))
    codes = response.data['data']['recovery_codes']

    assert response.status_code == 200 and mfa.is_enabled(user)
    assert len(set(codes)) == 8 and mfa.recovery_codes_left(user) == 8
    assert not RecoveryCode.objects.filter(user=user, code_hash__in=codes).exists()
    assert SecurityEvent.objects.filter(kind='mfa_enrolled', user_id=user.pk).count() == 1
    assert AuditLog.objects.filter(resource_id=user.pk, detail__icontains='second factor').exists()
    session.refresh_from_db()
    assert session.mfa_verified_at is not None
    assert [m.to for m in mail.outbox] == [[user.email]]


def test_nothing_secret_is_written_down(caplog):
    user = UserFactory(role='FARMER')
    _, _, secret, codes = turned_on(user)
    written = caplog.text + ''.join(f'{e.detail}' for e in SecurityEvent.objects.all())
    written += ''.join(f'{a.detail} {a.changes}' for a in AuditLog.objects.all())
    message = mail.outbox[0]
    written += message.subject + message.body + ''.join(str(part) for part, _ in message.alternatives)
    for hidden in (secret, PASSWORD, *codes):
        assert hidden not in written


def test_it_signs_out_every_other_device_and_keeps_this_one():
    user = UserFactory(role='FARMER')
    other = APIClient()
    signed = other.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')
    other.credentials(HTTP_AUTHORIZATION=f"Bearer {signed.json()['data']['token']}")
    old_refresh = signed.cookies[REFRESH_COOKIE].value
    assert other.get(ME).status_code == 200

    client, session, _, _ = turned_on(user)

    refused = other.get(ME)
    assert refused.status_code == 401 and refused.data['code'] == 'session_ended'
    assert client.get(ME).status_code == 200
    ended = UserSession.objects.filter(user=user).exclude(pk=session.pk).get()
    assert ended.revoked_reason == 'mfa_enrolled'
    renewing = APIClient()
    renewing.cookies[REFRESH_COOKIE] = old_refresh
    assert renewing.post('/api/auth/token/refresh', {}, format='json').status_code == 401


def test_new_codes_work_right_after_turning_it_on():
    # The tab can close before the codes are saved. A code from the app makes new ones.
    client, _, secret, old = turned_on()
    # The app code that turned it on is spent, so the next one is used.
    later = pyotp.TOTP(secret).at(__import__('time').time() + 30)
    response = client.post(NEW_CODES, {'code': later}, format='json')
    assert response.status_code == 200
    assert len(set(response.data['data']['recovery_codes']) - set(old)) == 8


# ── who may not ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', ['FARMER', 'ADMIN'])
def test_someone_who_has_it_on_is_refused(role):
    user = UserFactory(role=role)
    enable_factor(user)
    before = SecondFactor.objects.get(user=user).secret_encrypted
    client = client_with(user, session_for(user, verified_minutes_ago=0))
    for response in (start(client), confirm(client, '123456')):
        assert response.status_code == 409 and response.data['code'] == 'mfa_already_on'
    assert SecondFactor.objects.get(user=user).secret_encrypted == before


def test_a_support_visit_is_refused():
    admin, person = admin_and_person('FARMER')
    token, _ = acting(admin, person, mode='edit')
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    for response in (start(client), confirm(client, '123456')):
        assert response.status_code == 403 and response.data['code'] == 'support_blocked'


def test_an_account_without_a_phone_is_asked_for_one_first():
    client, _ = signed_in(UserFactory(role='FARMER', phone=None))
    response = start(client)
    assert response.status_code == 403 and response.data['code'] == 'phone_required'


def test_a_token_from_before_sessions_cannot_turn_it_on():
    user = UserFactory(role='FARMER')
    response = start(client_with(user))
    assert response.status_code == 409 and response.data['code'] == 'mfa_start_again'


def test_a_stranger_is_told_to_sign_in():
    assert start(APIClient()).status_code == 401


# ── the email ───────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('lang', ['en', 'fr', 'rw'])
def test_the_email_is_in_the_persons_language(lang):
    user = UserFactory(role='FARMER', preferred_language=lang)
    turned_on(user)
    words = mail_words.WORDS[lang]
    message = mail.outbox[0]
    html = message.alternatives[0][0]
    assert message.subject == words['mfa_on_subject']
    assert f'<html lang="{lang}">' in html and words['mfa_on_subject'] in html
    assert words['mfa_on_closing'] in message.body and words['sign_off'] in message.body


def test_a_mail_problem_never_undoes_it():
    user = UserFactory(role='FARMER')
    client, _ = signed_in(user)
    secret = start(client).data['data']['secret']
    with mock.patch('users.mfa_enroll_views.send_email', side_effect=OSError('no mail today')):
        assert confirm(client, totp(secret)).status_code == 200
    assert mfa.is_enabled(user)


# ── the limit ───────────────────────────────────────────────────────────────────────────────

@pytest.mark.throttle
def test_too_many_tries_in_a_minute_are_refused(monkeypatch):
    monkeypatch.setattr(throttles.MfaAccountThrottle, 'rate', '3/minute', raising=False)
    client, _ = signed_in(UserFactory(role='FARMER'))
    codes = [start(client).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_the_allowance_is_the_one_we_decided(settings):
    assert settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['mfa_account'] == '10/minute'
