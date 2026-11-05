"""Looking after the authenticator app: its status, new recovery codes, resetting another admin, and the last resort command.

Secrets and codes are made at run time. Nothing secret reaches a log, an event, the audit log or an email.
"""
from unittest import mock

import pytest
from django.core import mail
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from core import lockout
from logs.models import SecurityEvent
from tests.factories import UserFactory
from tests.mfa_helpers import client_with, enable_factor, session_for, sign_in_admin, totp
from users import mfa
from users.models import RecoveryCode, SecondFactor, UserSession

pytestmark = pytest.mark.django_db

STATUS = '/api/auth/mfa'
NEW_CODES = '/api/auth/mfa/recovery-codes'
STEP_UP = '/api/auth/mfa/step-up'


def reset_url(user):
    return f'/api/admin/users/{user.pk}/mfa/reset'


def an_admin(verified_minutes_ago=0, with_app=True):
    """An admin with a live verified session. Returns (user, secret or None, session, client)."""
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user) if with_app else None
    session = session_for(user, verified_minutes_ago=verified_minutes_ago)
    return user, secret, session, client_with(user, session)


# ── status ──────────────────────────────────────────────────────────────────────────────────

def test_the_status_says_it_is_on_and_how_many_recovery_codes_are_left():
    user, _, _, client = an_admin()
    codes = mfa.new_recovery_codes(user)
    data = client.get(STATUS).json()['data']
    assert data['enabled'] is True and data['enabledAt'] and data['recoveryCodesLeft'] == 8
    mfa.use_recovery_code(user, codes[0])
    assert client.get(STATUS).json()['data']['recoveryCodesLeft'] == 7


def test_the_status_says_when_it_is_off():
    _, _, _, client = an_admin(with_app=False)
    data = client.get(STATUS).json()['data']
    assert data['enabled'] is False and data['enabledAt'] is None and data['recoveryCodesLeft'] == 0


def test_the_status_shows_no_secret_and_no_code():
    user, secret, _, client = an_admin()
    mfa.new_recovery_codes(user)
    body = client.get(STATUS).content.decode()
    assert secret not in body and 'secret' not in body.lower() and 'hash' not in body.lower()


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_an_admin_may_read_the_status(role):
    user = UserFactory(role=role)
    assert client_with(user, session_for(user)).get(STATUS).status_code == 403


def test_a_stranger_is_told_to_sign_in_for_the_status():
    assert APIClient().get(STATUS).status_code == 401


# ── new recovery codes ──────────────────────────────────────────────────────────────────────

def test_a_right_app_code_replaces_all_recovery_codes():
    user, secret, _, client = an_admin()
    old = mfa.new_recovery_codes(user)
    response = client.post(NEW_CODES, {'code': totp(secret)}, format='json')
    new = response.json()['data']['recoveryCodes']
    assert response.status_code == 200 and len(new) == 8 and not set(new) & set(old)
    assert mfa.use_recovery_code(user, old[0]) is False
    assert mfa.use_recovery_code(user, new[0]) is True
    assert SecurityEvent.objects.filter(kind='mfa_recovery_regenerated', user_id=user.pk).exists()
    assert AuditLog.objects.filter(user_id=user.pk, detail__icontains='recovery codes').exists()


def test_a_wrong_app_code_keeps_the_old_recovery_codes_and_counts_toward_the_lockout():
    user, secret, _, client = an_admin()
    old = mfa.new_recovery_codes(user)
    wrong = '000000' if totp(secret) != '000000' else '111111'
    answers = [client.post(NEW_CODES, {'code': wrong}, format='json').status_code for _ in range(5)]
    assert answers[:4] == [422] * 4 and answers[4] == 429
    assert lockout.is_locked(user.email) > 0
    lockout.clear(user.email)
    assert mfa.use_recovery_code(user, old[0]) is True
    assert SecurityEvent.objects.filter(kind='mfa_failed', user_id=user.pk).exists()


def test_a_recovery_code_cannot_stand_in_for_the_app_code():
    user, _, _, client = an_admin()
    old = mfa.new_recovery_codes(user)
    assert client.post(NEW_CODES, {'code': old[0]}, format='json').status_code == 422
    assert client.post(NEW_CODES, {'recovery_code': old[0]}, format='json').status_code == 422
    assert mfa.recovery_codes_left(user) == 8


def test_the_same_app_code_cannot_ask_twice():
    user, secret, _, client = an_admin()
    code = totp(secret)
    assert client.post(NEW_CODES, {'code': code}, format='json').status_code == 200
    assert client.post(NEW_CODES, {'code': code}, format='json').status_code == 422


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_an_admin_may_ask_for_new_recovery_codes(role):
    user = UserFactory(role=role)
    assert client_with(user, session_for(user)).post(NEW_CODES, {'code': '123456'}, format='json').status_code == 403


# ── resetting another admin ─────────────────────────────────────────────────────────────────

def a_second_admin():
    target = UserFactory(role='ADMIN')
    secret = enable_factor(target)
    mfa.new_recovery_codes(target)
    return target, secret


def test_resetting_needs_a_recent_code_and_then_works_after_step_up():
    actor, actor_secret, _, client = an_admin(verified_minutes_ago=30)
    target, _ = a_second_admin()
    first = client.post(reset_url(target))
    assert first.status_code == 403 and first.json()['code'] == 'mfa_recent_required'
    assert mfa.is_enabled(target) is True
    assert client.post(STEP_UP, {'code': totp(actor_secret)}, format='json').status_code == 200
    assert client.post(reset_url(target)).status_code == 200
    assert mfa.is_enabled(target) is False


def test_a_reset_removes_the_app_and_every_recovery_code_and_signs_the_person_out():
    actor, _, _, client = an_admin()
    target, target_secret = a_second_admin()
    target_client = APIClient()
    token = sign_in_admin(target_client, target, secret=target_secret).json()['data']['token']
    target_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    assert target_client.get('/api/auth/me').status_code == 200

    assert client.post(reset_url(target)).status_code == 200
    assert not SecondFactor.objects.filter(user=target).exists()
    assert not RecoveryCode.objects.filter(user=target).exists()
    assert not UserSession.objects.filter(user=target, revoked_at__isnull=True).exists()
    assert target_client.get('/api/auth/me').status_code == 401


def test_the_person_goes_through_set_up_at_their_next_sign_in():
    actor, _, _, client = an_admin()
    target, _ = a_second_admin()
    client.post(reset_url(target))
    answer = APIClient().post('/api/auth/login', {'email': target.email, 'password': 'Pass1234'}, format='json')
    assert answer.json()['data']['mfa']['step'] == 'setup'


def test_the_admin_who_reset_it_stays_signed_in():
    actor, _, session, client = an_admin()
    target, _ = a_second_admin()
    client.post(reset_url(target))
    assert client.get('/api/auth/me').status_code == 200
    assert UserSession.objects.get(pk=session.pk).revoked_at is None


def test_a_reset_is_written_down_with_who_did_it_and_to_whom():
    actor, _, _, client = an_admin()
    target, _ = a_second_admin()
    client.post(reset_url(target))
    event = SecurityEvent.objects.get(kind='mfa_reset')
    assert event.user_id == target.pk and actor.email in event.detail
    entry = AuditLog.objects.filter(user_id=actor.pk, detail__icontains='second factor').first()
    assert entry and target.email in entry.detail


def test_the_person_is_told_by_email_who_reset_it():
    actor, _, _, client = an_admin()
    target, _ = a_second_admin()
    client.post(reset_url(target))
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == [target.email]
    assert actor.name in message.body or actor.email in message.body
    assert 'authenticator' in message.body.lower()


def test_a_mail_problem_does_not_stop_the_reset():
    actor, _, _, client = an_admin()
    target, _ = a_second_admin()
    with mock.patch('users.mfa_views.send_email', side_effect=RuntimeError('mail is down')):
        response = client.post(reset_url(target))
    assert response.status_code == 200 and mfa.is_enabled(target) is False


def test_an_admin_cannot_reset_their_own_app_through_the_site():
    actor, _, _, client = an_admin()
    response = client.post(reset_url(actor))
    assert response.status_code == 400
    assert mfa.is_enabled(actor) is True


def test_there_is_nothing_to_reset_for_someone_with_no_app_or_who_is_not_an_admin():
    _, _, _, client = an_admin()
    no_app = UserFactory(role='ADMIN')
    farmer = UserFactory(role='FARMER')
    assert client.post(reset_url(no_app)).status_code == 404
    assert client.post(reset_url(farmer)).status_code == 404
    assert client.post('/api/admin/users/not-a-user/mfa/reset').status_code == 404


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_an_admin_may_reset(role):
    user = UserFactory(role=role)
    target, _ = a_second_admin()
    assert client_with(user, session_for(user)).post(reset_url(target)).status_code == 403
    assert mfa.is_enabled(target) is True


def test_no_secret_code_or_recovery_code_reaches_a_log_an_event_the_audit_log_or_the_email(caplog):
    caplog.set_level('DEBUG')
    actor, actor_secret, _, client = an_admin()
    target, target_secret = a_second_admin()
    codes = mfa.new_recovery_codes(target)
    new_codes = client.post(NEW_CODES, {'code': totp(actor_secret)}, format='json').json()['data']['recoveryCodes']
    client.post(reset_url(target))
    seen = [actor_secret, target_secret, *codes, *new_codes, *(c.replace('-', '') for c in codes + new_codes)]
    written = caplog.text + ' '.join(str(r) for m in (SecurityEvent, AuditLog) for r in m.objects.all().values())
    written += ' '.join(message.body for message in mail.outbox)
    for value in seen:
        assert value not in written
