"""Turning two-step sign in off: the password and a code. A farmer or supervisor may. An admin never.

Secrets, codes and recovery codes are made at run time.
"""
from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from core import lockout, mail_words
from logs.models import SecurityEvent
from tests.factories import UserFactory
from tests.mfa_helpers import PASSWORD, client_with, enable_factor, session_for, totp
from tests.support_helpers import acting, admin_and_person
from users import mfa
from users.models import RecoveryCode, SecondFactor, UserSession

pytestmark = pytest.mark.django_db

DISABLE = '/api/auth/mfa/disable'
LOGIN = '/api/auth/login'


def with_it_on(role='FARMER', **fields):
    user = UserFactory(role=role, **fields)
    secret = enable_factor(user)
    codes = mfa.new_recovery_codes(user)
    session = session_for(user, verified_minutes_ago=0)
    return user, secret, codes, session, client_with(user, session)


def turn_off(client, **body):
    return client.post(DISABLE, body, format='json')


def wrong_code(secret):
    return '000000' if totp(secret) != '000000' else '111111'


def test_an_admin_cannot_turn_it_off():
    user, secret, _, _, client = with_it_on('ADMIN')
    assert turn_off(client, password=PASSWORD, code=totp(secret)).status_code == 403
    assert mfa.is_enabled(user)


@pytest.mark.parametrize('body, code', [
    ({}, 'wrong_password'),
    ({'password': 'not-the-password', 'code': 'GOOD'}, 'wrong_password'),
    ({'password': PASSWORD}, 'mfa_wrong_code'),
    ({'password': PASSWORD, 'code': 'BAD'}, 'mfa_wrong_code'),
    ({'password': PASSWORD, 'recovery_code': 'AAAAA-AAAAA'}, 'mfa_wrong_code'),
])
def test_a_missing_or_wrong_part_is_refused_and_counted(body, code):
    user, secret, _, _, client = with_it_on()
    given = {k: {'GOOD': totp(secret), 'BAD': wrong_code(secret)}.get(v, v) for k, v in body.items()}
    for _ in range(4):
        response = turn_off(client, **given)
        assert response.status_code == 422 and response.data['code'] == code
    assert turn_off(client, **given).status_code == 429
    assert lockout.is_locked(user.email) and mfa.is_enabled(user)


def test_a_wrong_password_does_not_use_up_a_recovery_code():
    user, _, codes, _, client = with_it_on()
    turn_off(client, password='not-the-password', recovery_code=codes[0])
    assert mfa.recovery_codes_left(user) == 8
    assert turn_off(client, password=PASSWORD, recovery_code=codes[0]).status_code == 200


def test_the_right_password_does_not_clear_the_count_of_wrong_codes():
    # Someone with the password and a signed in browser must not get five more guesses each time.
    _, secret, _, _, client = with_it_on()
    statuses = [turn_off(client, password=PASSWORD, code=wrong_code(secret)).status_code for _ in range(5)]
    assert statuses == [422, 422, 422, 422, 429]


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
@pytest.mark.parametrize('proof', ['app code', 'recovery code'])
def test_an_app_code_or_a_recovery_code_turns_it_off(role, proof):
    user, secret, codes, session, client = with_it_on(role)
    other = session_for(user, verified_minutes_ago=0)
    given = {'code': totp(secret)} if proof == 'app code' else {'recovery_code': codes[3]}

    response = turn_off(client, password=PASSWORD, **given)

    assert response.status_code == 200, response.data
    assert not SecondFactor.objects.filter(user=user).exists()
    assert not RecoveryCode.objects.filter(user=user).exists()
    other.refresh_from_db()
    session.refresh_from_db()
    assert other.revoked_reason == 'mfa_disabled' and session.revoked_at is None
    assert SecurityEvent.objects.filter(kind='mfa_disabled', user_id=user.pk).count() == 1
    assert [m.to for m in mail.outbox] == [[user.email]]


@pytest.mark.parametrize('lang', ['fr', 'rw'])
def test_the_email_is_in_the_persons_language(lang):
    _, secret, _, _, client = with_it_on(preferred_language=lang)
    turn_off(client, password=PASSWORD, code=totp(secret))
    assert mail.outbox[0].subject == mail_words.WORDS[lang]['mfa_off_subject']


def test_the_reminder_waits_30_days_after_turning_it_off():
    user, secret, _, _, client = with_it_on()
    turn_off(client, password=PASSWORD, code=totp(secret))
    user.refresh_from_db()
    wait = user.mfa_prompt_snoozed_until - timezone.now()
    assert timedelta(days=29, hours=23) < wait <= timedelta(days=30)


def test_turning_it_off_when_it_is_off():
    user = UserFactory(role='FARMER')
    client = client_with(user, session_for(user))
    response = turn_off(client, password=PASSWORD, code='123456')
    assert response.status_code == 400 and response.data['code'] == 'mfa_not_on'


def test_a_support_visit_is_refused():
    admin, person = admin_and_person('FARMER')
    enable_factor(person)
    token, _ = acting(admin, person, mode='edit')
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    response = turn_off(client, password=PASSWORD, code='123456')
    assert response.status_code == 403 and response.data['code'] == 'support_blocked'


def test_the_next_sign_in_needs_only_the_password():
    user, secret, _, _, client = with_it_on()
    turn_off(client, password=PASSWORD, code=totp(secret))
    response = APIClient().post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')
    assert response.json()['data']['token'] and 'mfa' not in response.json()['data']
    assert UserSession.objects.filter(user=user, revoked_at__isnull=True).count() == 2
