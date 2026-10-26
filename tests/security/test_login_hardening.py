from unittest import mock

import bcrypt
import pytest
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from core import lockout
from tests.factories import UserFactory
from users.models import User

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'


def attempt(client, email, password):
    return client.post(LOGIN, {'email': email, 'password': password}, format='json')


# ── lockout ─────────────────────────────────────────────────────────────────────────────────

def test_five_failures_lock_the_account_even_for_the_right_password(api_client):
    user = UserFactory()
    for _ in range(5):
        assert attempt(api_client, user.email, 'Wrong1234').status_code == 401
    response = attempt(api_client, user.email, 'Pass1234')
    assert response.status_code == 429
    assert 'Too many attempts' in response.json()['message']
    assert 'ssms_refresh' not in response.cookies


def test_an_unknown_email_is_locked_in_exactly_the_same_way(api_client):
    for _ in range(5):
        assert attempt(api_client, 'nobody@example.rw', 'Wrong1234').status_code == 401
    assert attempt(api_client, 'nobody@example.rw', 'Wrong1234').status_code == 429


def test_the_lock_follows_the_email_not_its_spelling(api_client):
    UserFactory(email='aline@example.rw')
    for spelling in ['aline@example.rw', 'ALINE@example.rw', ' aline@example.rw', 'Aline@Example.rw', 'aline@example.rw']:
        attempt(api_client, spelling, 'Wrong1234')
    assert attempt(api_client, 'aline@example.rw', 'Pass1234').status_code == 429


def test_other_accounts_are_not_affected(api_client):
    UserFactory(email='victim@example.rw')
    other = UserFactory(email='other@example.rw')
    for _ in range(5):
        attempt(api_client, 'victim@example.rw', 'Wrong1234')
    assert attempt(api_client, other.email, 'Pass1234').status_code == 200


def test_a_successful_login_clears_the_counter(api_client):
    user = UserFactory()
    for _ in range(4):
        attempt(api_client, user.email, 'Wrong1234')
    assert attempt(api_client, user.email, 'Pass1234').status_code == 200
    for _ in range(4):
        assert attempt(api_client, user.email, 'Wrong1234').status_code == 401
    assert attempt(api_client, user.email, 'Pass1234').status_code == 200


def test_the_right_password_for_an_unverified_account_is_not_a_failure(api_client):
    user = UserFactory(is_email_verified=False)
    for _ in range(7):
        assert attempt(api_client, user.email, 'Pass1234').status_code == 401
    assert lockout.is_locked(user.email) == 0


def test_the_lock_ends_after_fifteen_minutes(api_client):
    user = UserFactory()
    for _ in range(5):
        attempt(api_client, user.email, 'Wrong1234')
    assert lockout.is_locked(user.email) > 0
    with mock.patch('core.lockout.time.time', return_value=__import__('time').time() + 16 * 60):
        assert lockout.is_locked(user.email) == 0


def test_lockout_helpers_report_seconds_left():
    for _ in range(5):
        lockout.record_failure('someone@example.rw')
    left = lockout.is_locked('someone@example.rw')
    assert 14 * 60 < left <= 15 * 60
    lockout.clear('someone@example.rw')
    assert lockout.is_locked('someone@example.rw') == 0


# ── timing and hashes ──────────────────────────────────────────────────────────────────────

def test_a_missing_user_still_runs_a_password_hash():
    from core.auth_backends import BcryptAuthBackend

    with mock.patch('core.auth_backends.check_password') as hasher:
        assert BcryptAuthBackend().authenticate(None, email='nobody@example.rw', password='Whatever1') is None
    assert hasher.call_count == 1


def test_an_old_node_bcrypt_hash_still_logs_in_and_is_upgraded(api_client, settings):
    settings.PASSWORD_HASHERS = [
        'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
        'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    ]
    user = UserFactory()
    legacy = bcrypt.hashpw(b'Pass1234', bcrypt.gensalt(rounds=4)).decode()
    User.objects.filter(pk=user.pk).update(password=legacy)

    assert attempt(api_client, user.email, 'Pass1234').status_code == 200

    user.refresh_from_db()
    assert user.password.startswith('bcrypt_sha256$')
    # and the upgraded hash keeps working
    assert attempt(APIClient(), user.email, 'Pass1234').status_code == 200


def test_a_wrong_password_never_upgrades_a_legacy_hash(api_client):
    user = UserFactory()
    legacy = bcrypt.hashpw(b'Pass1234', bcrypt.gensalt(rounds=4)).decode()
    User.objects.filter(pk=user.pk).update(password=legacy)
    attempt(api_client, user.email, 'Wrong1234')
    user.refresh_from_db()
    assert user.password == legacy


# ── audit ──────────────────────────────────────────────────────────────────────────────────

def test_a_failed_login_is_audited_without_the_password(api_client):
    user = UserFactory()
    attempt(api_client, user.email, 'Hunter2-secret')
    entry = AuditLog.objects.get(action='OTHER')
    assert user.email in entry.detail
    assert 'Hunter2-secret' not in entry.detail
    assert 'ailed' in entry.detail


def test_a_failed_login_for_an_unknown_email_is_audited_too(api_client):
    attempt(api_client, 'nobody@example.rw', 'Hunter2-secret')
    entry = AuditLog.objects.get(action='OTHER')
    assert 'nobody@example.rw' in entry.detail
    assert 'Hunter2-secret' not in entry.detail


def test_a_successful_login_is_not_a_failure_entry(api_client):
    user = UserFactory()
    attempt(api_client, user.email, 'Pass1234')
    assert not AuditLog.objects.filter(action='OTHER').exists()
