"""Signing in as an admin: a password, then a code from the authenticator app, or the set-up of one.

Secrets, codes and challenges are made at run time. A correct password for an admin gives a challenge and no session.
"""
import time
from unittest import mock

import pyotp
import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from core import lockout
from logs.models import SecurityEvent
from tests.factories import UserFactory
from tests.mfa_helpers import PASSWORD, enable_factor, sign_in_admin, totp
from users import mfa
from users import mfa_challenge as challenge
from users.cookie_utils import REFRESH_COOKIE
from users.models import RecoveryCode, SecondFactor, UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
VERIFY = '/api/auth/mfa/verify'
SETUP_START = '/api/auth/mfa/setup/start'
SETUP_CONFIRM = '/api/auth/mfa/setup/confirm'


def password_step(user, client=None):
    client = client or APIClient()
    return client, client.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')


def challenge_for(user, client=None):
    client, response = password_step(user, client)
    return client, response.json()['data']['mfa']['challenge']


# ── the password step ───────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_a_farmer_or_supervisor_signs_in_with_the_password_alone(role):
    _, response = password_step(UserFactory(role=role))
    assert response.status_code == 200
    data = response.json()['data']
    assert data['token'] and 'mfa' not in data
    assert REFRESH_COOKIE in response.cookies


def test_an_admin_without_the_app_is_sent_to_set_it_up_and_gets_no_session():
    user = UserFactory(role='ADMIN')
    _, response = password_step(user)
    data = response.json()['data']
    assert response.status_code == 200
    assert data['mfa']['step'] == 'setup' and data['mfa']['challenge']
    assert 'token' not in data and REFRESH_COOKIE not in response.cookies
    assert not UserSession.objects.filter(user=user).exists()


def test_an_admin_with_the_app_is_asked_for_a_code_and_gets_no_session():
    user = UserFactory(role='ADMIN')
    enable_factor(user)
    _, response = password_step(user)
    data = response.json()['data']
    assert data['mfa']['step'] == 'code'
    assert 'token' not in data and REFRESH_COOKIE not in response.cookies
    assert not UserSession.objects.filter(user=user).exists()


def test_a_wrong_password_is_refused_for_an_admin_as_for_anyone():
    user = UserFactory(role='ADMIN')
    response = APIClient().post(LOGIN, {'email': user.email, 'password': 'wrong-password'}, format='json')
    assert response.status_code == 401 and 'mfa' not in response.json().get('data', {})


def test_an_admin_whose_email_is_not_verified_still_gets_the_usual_refusal():
    user = UserFactory(role='ADMIN', is_email_verified=False)
    response = APIClient().post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')
    assert response.status_code == 401 and response.json()['message'] == 'email_not_verified'


# ── set-up ──────────────────────────────────────────────────────────────────────────────────

def test_set_up_gives_a_secret_and_a_link_for_the_qr_code():
    user = UserFactory(role='ADMIN')
    client, token = challenge_for(user)
    response = client.post(SETUP_START, {'challenge': token}, format='json')
    data = response.json()['data']
    assert response.status_code == 200
    assert len(data['secret']) == 32 and data['otpauthUri'].startswith('otpauth://totp/')
    assert data['secret'] in data['otpauthUri']
    assert mfa.is_enabled(user) is False


def test_set_up_confirmed_with_a_right_code_turns_it_on_and_signs_the_admin_in():
    user = UserFactory(role='ADMIN')
    client, token = challenge_for(user)
    secret = client.post(SETUP_START, {'challenge': token}, format='json').json()['data']['secret']
    response = client.post(SETUP_CONFIRM, {'challenge': token, 'code': totp(secret)}, format='json')
    data = response.json()['data']
    assert response.status_code == 200
    assert data['token'] and data['user']['email'] == user.email and REFRESH_COOKIE in response.cookies
    assert len(data['recoveryCodes']) == 8
    assert mfa.is_enabled(user) is True and mfa.recovery_codes_left(user) == 8
    factor = SecondFactor.objects.get(user=user)
    assert factor.pending_secret_encrypted == '' and mfa.decrypt(factor.secret_encrypted) == secret
    assert UserSession.objects.get(user=user).mfa_verified_at is not None


def test_set_up_confirmed_with_a_wrong_code_leaves_it_off():
    user = UserFactory(role='ADMIN')
    client, token = challenge_for(user)
    secret = client.post(SETUP_START, {'challenge': token}, format='json').json()['data']['secret']
    wrong = '000000' if totp(secret) != '000000' else '111111'
    response = client.post(SETUP_CONFIRM, {'challenge': token, 'code': wrong}, format='json')
    assert response.status_code == 401 and 'token' not in response.json().get('data', {})
    assert mfa.is_enabled(user) is False and not UserSession.objects.filter(user=user).exists()


def test_starting_set_up_again_replaces_the_secret_that_was_waiting():
    user = UserFactory(role='ADMIN')
    client, token = challenge_for(user)
    first = client.post(SETUP_START, {'challenge': token}, format='json').json()['data']['secret']
    second = client.post(SETUP_START, {'challenge': token}, format='json').json()['data']['secret']
    assert first != second
    assert client.post(SETUP_CONFIRM, {'challenge': token, 'code': totp(first)}, format='json').status_code == 401
    assert client.post(SETUP_CONFIRM, {'challenge': token, 'code': totp(second)}, format='json').status_code == 200


def test_confirming_without_starting_is_refused():
    client, token = challenge_for(UserFactory(role='ADMIN'))
    response = client.post(SETUP_CONFIRM, {'challenge': token, 'code': '123456'}, format='json')
    assert response.status_code in (400, 401)


def test_a_finished_set_up_cannot_be_used_again_with_the_same_challenge():
    user = UserFactory(role='ADMIN')
    client, token = challenge_for(user)
    secret = client.post(SETUP_START, {'challenge': token}, format='json').json()['data']['secret']
    assert client.post(SETUP_CONFIRM, {'challenge': token, 'code': totp(secret)}, format='json').status_code == 200
    assert client.post(SETUP_START, {'challenge': token}, format='json').status_code == 401


# ── the code step ───────────────────────────────────────────────────────────────────────────

def test_a_right_code_signs_the_admin_in_and_records_it_on_the_session():
    user = UserFactory(role='ADMIN')
    response = sign_in_admin(APIClient(), user)
    data = response.json()['data']
    assert response.status_code == 200 and data['token'] and REFRESH_COOKIE in response.cookies
    assert data['user']['role'] == 'ADMIN'
    assert UserSession.objects.get(user=user).mfa_verified_at is not None


def test_the_device_and_the_shared_computer_tick_travel_with_the_code():
    user = UserFactory(role='ADMIN')
    response = sign_in_admin(APIClient(), user, sharedDevice=True)
    assert response.status_code == 200
    assert UserSession.objects.get(user=user).is_shared_device is True


def test_a_wrong_code_is_refused_and_signs_nobody_in():
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    client, token = challenge_for(user)
    wrong = '000000' if totp(secret) != '000000' else '111111'
    response = client.post(VERIFY, {'challenge': token, 'code': wrong}, format='json')
    assert response.status_code == 401 and 'token' not in response.json().get('data', {})
    assert not UserSession.objects.filter(user=user).exists()


def test_a_code_cannot_be_used_twice():
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    code = totp(secret)
    client, token = challenge_for(user)
    assert client.post(VERIFY, {'challenge': token, 'code': code}, format='json').status_code == 200
    client2, token2 = challenge_for(user)
    assert client2.post(VERIFY, {'challenge': token2, 'code': code}, format='json').status_code == 401


def test_a_recovery_code_signs_in_once():
    user = UserFactory(role='ADMIN')
    enable_factor(user)
    code = mfa.new_recovery_codes(user)[0]
    client, token = challenge_for(user)
    assert client.post(VERIFY, {'challenge': token, 'recovery_code': code}, format='json').status_code == 200
    client2, token2 = challenge_for(user)
    assert client2.post(VERIFY, {'challenge': token2, 'recovery_code': code}, format='json').status_code == 401
    assert mfa.recovery_codes_left(user) == 7


def test_the_recovery_code_may_arrive_in_camel_case_as_the_website_sends_it():
    user = UserFactory(role='ADMIN')
    enable_factor(user)
    code = mfa.new_recovery_codes(user)[1]
    client, token = challenge_for(user)
    assert client.post(VERIFY, {'challenge': token, 'recoveryCode': code}, format='json').status_code == 200


# ── the challenge ───────────────────────────────────────────────────────────────────────────

def test_a_set_up_challenge_does_not_work_for_the_code_step_and_the_reverse():
    asking, setting_up = UserFactory(role='ADMIN'), UserFactory(role='ADMIN')
    secret = enable_factor(asking)
    client = APIClient()
    code_token = challenge_for(asking, client)[1]
    setup_token = challenge_for(setting_up, client)[1]
    assert client.post(VERIFY, {'challenge': setup_token, 'code': '123456'}, format='json').status_code == 401
    assert client.post(SETUP_START, {'challenge': code_token}, format='json').status_code == 401
    assert client.post(VERIFY, {'challenge': code_token, 'code': totp(secret)}, format='json').status_code == 200


def test_a_spent_challenge_is_refused():
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    client, token = challenge_for(user)
    assert client.post(VERIFY, {'challenge': token, 'code': totp(secret)}, format='json').status_code == 200
    again = client.post(VERIFY, {'challenge': token, 'code': totp(secret, time.time() + 30)}, format='json')
    assert again.status_code == 401


@pytest.mark.parametrize('bad', ['', 'abc', None, 123, {}, 'x' * 400])
def test_a_challenge_that_is_not_one_is_refused_in_the_same_way(bad):
    response = APIClient().post(VERIFY, {'challenge': bad, 'code': '123456'}, format='json')
    assert response.status_code == 401 and response.json()['reason'] == 'challenge'


def test_an_expired_challenge_says_so_so_the_page_can_start_over():
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    client, token = challenge_for(user)
    later = time.time() + challenge.CHALLENGE_SECONDS + 5
    with mock.patch('time.time', return_value=later):
        response = client.post(VERIFY, {'challenge': token, 'code': totp(secret, later)}, format='json')
    assert response.status_code == 401 and response.json()['reason'] == 'challenge'


def test_a_challenge_for_an_account_that_was_turned_off_is_refused():
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    client, token = challenge_for(user)
    type(user).objects.filter(pk=user.pk).update(is_active=False)
    assert client.post(VERIFY, {'challenge': token, 'code': totp(secret)}, format='json').status_code == 401


def test_a_challenge_for_someone_who_is_no_longer_an_admin_is_refused():
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    client, token = challenge_for(user)
    type(user).objects.filter(pk=user.pk).update(role='FARMER')
    assert client.post(VERIFY, {'challenge': token, 'code': totp(secret)}, format='json').status_code == 401


def test_a_second_factor_reset_during_sign_in_sends_the_admin_back_to_start_over():
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    client, token = challenge_for(user)
    mfa.reset(user)
    response = client.post(VERIFY, {'challenge': token, 'code': totp(secret)}, format='json')
    assert response.status_code == 401 and response.json()['reason'] == 'challenge'


def test_five_wrong_codes_kill_the_challenge_so_even_the_right_code_is_refused():
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    client, token = challenge_for(user)
    with mock.patch('core.lockout.MAX_FAILURES', 99):   # so the email lockout does not answer first
        for _ in range(5):
            assert client.post(VERIFY, {'challenge': token, 'code': '000000'}, format='json').status_code == 401
        final = client.post(VERIFY, {'challenge': token, 'code': totp(secret)}, format='json')
    assert final.status_code == 401 and final.json()['reason'] == 'challenge'


# ── guessing ────────────────────────────────────────────────────────────────────────────────

def test_wrong_codes_across_fresh_challenges_lock_the_email_at_five():
    user = UserFactory(role='ADMIN')
    enable_factor(user)
    statuses = []
    for _ in range(5):
        client, token = challenge_for(user)
        statuses.append(client.post(VERIFY, {'challenge': token, 'code': '000000'}, format='json').status_code)
    assert statuses[:4] == [401] * 4 and statuses[4] == 429
    assert password_step(user)[1].status_code == 429   # the password step is locked too


def test_the_password_step_does_not_clear_the_count_for_an_admin():
    user = UserFactory(role='ADMIN')
    enable_factor(user)
    client = APIClient()
    for _ in range(2):
        assert client.post(LOGIN, {'email': user.email, 'password': 'wrong-password'}, format='json').status_code == 401
    token = client.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json').json()['data']['mfa']['challenge']
    statuses = [client.post(VERIFY, {'challenge': token, 'code': '000000'}, format='json').status_code for _ in range(3)]
    assert statuses == [401, 401, 429]


def test_the_password_step_still_clears_the_count_for_a_farmer():
    user = UserFactory(role='FARMER')
    client = APIClient()
    for _ in range(4):
        client.post(LOGIN, {'email': user.email, 'password': 'wrong-password'}, format='json')
    assert client.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json').status_code == 200
    assert lockout.is_locked(user.email) == 0
    for _ in range(4):
        assert client.post(LOGIN, {'email': user.email, 'password': 'wrong-password'}, format='json').status_code == 401


def test_a_right_code_clears_the_count():
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    for _ in range(3):
        lockout.record_failure(user.email)
    client, token = challenge_for(user)
    assert client.post(VERIFY, {'challenge': token, 'code': totp(secret)}, format='json').status_code == 200
    assert cache.get(lockout._key('fails', user.email)) is None


@pytest.mark.throttle
def test_the_code_endpoints_have_their_own_limit_per_address():
    client = APIClient()
    answers = [client.post(VERIFY, {'challenge': 'x', 'code': '123456'}, format='json').status_code for _ in range(11)]
    assert answers[:10] == [401] * 10 and answers[10] == 429


# ── what is written down ────────────────────────────────────────────────────────────────────

def test_each_step_writes_a_security_event_and_the_audit_log_notes_the_set_up():
    user = UserFactory(role='ADMIN')
    client, token = challenge_for(user)
    secret = client.post(SETUP_START, {'challenge': token}, format='json').json()['data']['secret']
    client.post(SETUP_CONFIRM, {'challenge': token, 'code': totp(secret)}, format='json')
    code_client, code_token = challenge_for(user)
    code_client.post(VERIFY, {'challenge': code_token, 'code': '000000'}, format='json')
    code_client2, code_token2 = challenge_for(user)
    code_client2.post(VERIFY, {'challenge': code_token2, 'recovery_code': mfa.new_recovery_codes(user)[0]}, format='json')
    kinds = set(SecurityEvent.objects.filter(user_id=user.pk).values_list('kind', flat=True))
    assert {'mfa_enrolled', 'mfa_failed', 'mfa_recovery_used'} <= kinds
    assert AuditLog.objects.filter(user_id=user.pk, resource='User', detail__icontains='second factor').exists()


def test_a_code_signs_in_and_writes_the_usual_sign_in_events():
    user = UserFactory(role='ADMIN')
    sign_in_admin(APIClient(), user)
    kinds = set(SecurityEvent.objects.filter(user_id=user.pk).values_list('kind', flat=True))
    assert {'login_ok', 'mfa_ok'} <= kinds


def test_no_secret_code_or_challenge_reaches_a_log_an_event_or_the_audit_log(caplog):
    caplog.set_level('DEBUG')
    user = UserFactory(role='ADMIN')
    client, token = challenge_for(user)
    secret = client.post(SETUP_START, {'challenge': token}, format='json').json()['data']['secret']
    code = totp(secret)
    done = client.post(SETUP_CONFIRM, {'challenge': token, 'code': code}, format='json').json()['data']
    client2, token2 = challenge_for(user)
    client2.post(VERIFY, {'challenge': token2, 'code': '987654'}, format='json')
    client3, token3 = challenge_for(user)
    client3.post(VERIFY, {'challenge': token3, 'recovery_code': done['recoveryCodes'][0]}, format='json')

    secrets_seen = [secret, code, token, token2, token3, '987654', *done['recoveryCodes'], *(c.replace('-', '') for c in done['recoveryCodes'])]
    written = caplog.text + ' '.join(
        str(row) for model in (SecurityEvent, AuditLog) for row in model.objects.all().values()
    )
    for value in secrets_seen:
        assert value not in written, 'a secret reached a log, an event or the audit log'


def test_the_codes_in_the_database_are_hashed_and_the_secret_is_encrypted():
    user = UserFactory(role='ADMIN')
    client, token = challenge_for(user)
    secret = client.post(SETUP_START, {'challenge': token}, format='json').json()['data']['secret']
    codes = client.post(SETUP_CONFIRM, {'challenge': token, 'code': totp(secret)}, format='json').json()['data']['recoveryCodes']
    factor = SecondFactor.objects.get(user=user)
    assert secret not in factor.secret_encrypted
    stored = ' '.join(RecoveryCode.objects.filter(user=user).values_list('code_hash', flat=True))
    assert not any(code.replace('-', '') in stored for code in codes)
    assert pyotp.TOTP(mfa.decrypt(factor.secret_encrypted)).at(time.time()) == totp(secret)
