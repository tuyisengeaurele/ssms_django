"""The second factor's building blocks: the secret kept encrypted, the 6 digit codes, and the recovery codes.

Secrets are made here at run time. No key, secret or code is written into the repository.
"""
import re
from urllib.parse import unquote

import pyotp
import pytest
from cryptography.fernet import Fernet
from django.utils import timezone

from tests.factories import UserFactory
from users import mfa
from users.models import RecoveryCode, SecondFactor

pytestmark = pytest.mark.django_db

NOW = 1_800_000_000.0   # any fixed moment. Its 30 second step is NOW // 30.
STEP = mfa.STEP_SECONDS


def make_factor(user, enabled=True):
    """A second factor for the user. Returns the secret (what the phone holds) and the row."""
    secret = pyotp.random_base32()
    row = SecondFactor.objects.create(
        user=user, secret_encrypted=mfa.encrypt(secret), enabled_at=timezone.now() if enabled else None,
    )
    return secret, row


def code_at(secret, moment):
    return pyotp.TOTP(secret).at(moment)


# ── the encrypted secret ────────────────────────────────────────────────────────────────────

def test_a_secret_is_unreadable_in_storage_and_comes_back_whole():
    secret = pyotp.random_base32()
    stored = mfa.encrypt(secret)
    assert secret not in stored
    assert mfa.decrypt(stored) == secret


def test_a_secret_cannot_be_read_with_another_key(settings):
    stored = mfa.encrypt(pyotp.random_base32())
    settings.MFA_ENCRYPTION_KEY = Fernet.generate_key().decode()
    with pytest.raises(mfa.MfaKeyError):
        mfa.decrypt(stored)


def test_the_phone_is_told_who_the_code_is_for():
    user = UserFactory(role='ADMIN', email='ange@example.rw')
    uri = unquote(mfa.otpauth_uri(user, pyotp.random_base32()))
    assert uri.startswith('otpauth://totp/')
    assert 'issuer=SSMS' in uri and 'ange@example.rw' in uri


def test_a_new_secret_is_a_long_random_base32_string():
    first, second = mfa.new_secret(), mfa.new_secret()
    assert first != second
    assert re.fullmatch(r'[A-Z2-7]{32}', first)


# ── is it on ────────────────────────────────────────────────────────────────────────────────

def test_the_second_factor_is_on_only_once_it_is_confirmed():
    user = UserFactory(role='ADMIN')
    assert mfa.is_enabled(user) is False
    make_factor(user, enabled=False)
    assert mfa.is_enabled(user) is False
    SecondFactor.objects.filter(user=user).update(enabled_at=timezone.now())
    assert mfa.is_enabled(user) is True


# ── the 6 digit code ────────────────────────────────────────────────────────────────────────

def test_the_code_for_this_moment_is_accepted():
    secret, row = make_factor(UserFactory(role='ADMIN'))
    assert mfa.check_code(row, code_at(secret, NOW), now=NOW) is True


@pytest.mark.parametrize('drift', [-STEP, STEP])
def test_a_code_one_step_early_or_late_is_accepted_for_a_slow_clock(drift):
    secret, row = make_factor(UserFactory(role='ADMIN'))
    assert mfa.check_code(row, code_at(secret, NOW + drift), now=NOW) is True


@pytest.mark.parametrize('drift', [-2 * STEP, 2 * STEP])
def test_a_code_two_steps_away_is_refused(drift):
    secret, row = make_factor(UserFactory(role='ADMIN'))
    assert mfa.check_code(row, code_at(secret, NOW + drift), now=NOW) is False


def test_a_code_cannot_be_used_twice():
    secret, row = make_factor(UserFactory(role='ADMIN'))
    code = code_at(secret, NOW)
    assert mfa.check_code(row, code, now=NOW) is True
    assert mfa.check_code(row, code, now=NOW) is False
    # The refusal holds when the row is read again, as a second request would.
    assert mfa.check_code(SecondFactor.objects.get(pk=row.pk), code, now=NOW + 5) is False


def test_an_older_code_is_refused_after_a_newer_one_was_used():
    secret, row = make_factor(UserFactory(role='ADMIN'))
    assert mfa.check_code(row, code_at(secret, NOW), now=NOW) is True
    assert mfa.check_code(row, code_at(secret, NOW - STEP), now=NOW) is False


def test_the_next_code_works_after_one_was_used():
    secret, row = make_factor(UserFactory(role='ADMIN'))
    assert mfa.check_code(row, code_at(secret, NOW), now=NOW) is True
    assert mfa.check_code(row, code_at(secret, NOW + STEP), now=NOW + STEP) is True


@pytest.mark.parametrize('bad', ['', '12345', '1234567', 'abcdef', '12 34 5x', None])
def test_a_code_that_is_not_six_digits_is_refused_without_an_error(bad):
    _, row = make_factor(UserFactory(role='ADMIN'))
    assert mfa.check_code(row, bad, now=NOW) is False


def test_spaces_in_the_code_are_ignored_as_people_type_them_in_groups():
    secret, row = make_factor(UserFactory(role='ADMIN'))
    code = code_at(secret, NOW)
    assert mfa.check_code(row, f'{code[:3]} {code[3:]}', now=NOW) is True


def test_the_pending_secret_is_what_set_up_checks_against():
    user = UserFactory(role='ADMIN')
    pending = pyotp.random_base32()
    row = SecondFactor.objects.create(user=user, pending_secret_encrypted=mfa.encrypt(pending))
    assert mfa.check_code(row, code_at(pending, NOW), pending=True, now=NOW) is True


def test_a_factor_with_no_active_secret_refuses_every_code():
    user = UserFactory(role='ADMIN')
    pending = pyotp.random_base32()
    row = SecondFactor.objects.create(user=user, pending_secret_encrypted=mfa.encrypt(pending))
    assert mfa.check_code(row, code_at(pending, NOW), now=NOW) is False


# ── recovery codes ──────────────────────────────────────────────────────────────────────────

ALPHABET = set('ABCDEFGHJKMNPQRSTUVWXYZ23456789')   # no 0, O, 1, I or L


def test_eight_distinct_recovery_codes_are_made_in_a_readable_form():
    codes = mfa.new_recovery_codes(UserFactory(role='ADMIN'))
    assert len(codes) == mfa.RECOVERY_COUNT == 8
    assert len(set(codes)) == 8
    for code in codes:
        assert re.fullmatch(r'[A-Z0-9]{5}-[A-Z0-9]{5}', code)
        assert set(code.replace('-', '')) <= ALPHABET


def test_recovery_codes_are_stored_only_as_hashes():
    user = UserFactory(role='ADMIN')
    codes = mfa.new_recovery_codes(user)
    stored = list(RecoveryCode.objects.filter(user=user).values_list('code_hash', flat=True))
    assert len(stored) == 8
    for code in codes:
        assert not any(code in value or code.replace('-', '') in value for value in stored)
    assert all(len(value) == 64 for value in stored)


def test_a_recovery_code_works_once_in_any_case_with_or_without_the_dash():
    user = UserFactory(role='ADMIN')
    code = mfa.new_recovery_codes(user)[0]
    assert mfa.use_recovery_code(user, code.lower().replace('-', '')) is True
    assert mfa.use_recovery_code(user, code) is False


def test_a_wrong_recovery_code_is_refused():
    user = UserFactory(role='ADMIN')
    mfa.new_recovery_codes(user)
    assert mfa.use_recovery_code(user, 'AAAAA-AAAAA') is False
    assert mfa.use_recovery_code(user, '') is False


def test_one_persons_recovery_code_does_not_work_for_another():
    first, second = UserFactory(role='ADMIN'), UserFactory(role='ADMIN')
    code = mfa.new_recovery_codes(first)[0]
    mfa.new_recovery_codes(second)
    assert mfa.use_recovery_code(second, code) is False


def test_new_recovery_codes_replace_every_old_one():
    user = UserFactory(role='ADMIN')
    old = mfa.new_recovery_codes(user)
    new = mfa.new_recovery_codes(user)
    assert RecoveryCode.objects.filter(user=user).count() == 8
    assert mfa.use_recovery_code(user, old[0]) is False
    assert mfa.use_recovery_code(user, new[0]) is True


def test_the_unused_recovery_codes_are_counted():
    user = UserFactory(role='ADMIN')
    codes = mfa.new_recovery_codes(user)
    assert mfa.recovery_codes_left(user) == 8
    mfa.use_recovery_code(user, codes[0])
    assert mfa.recovery_codes_left(user) == 7


# ── starting over ───────────────────────────────────────────────────────────────────────────

def test_a_reset_removes_the_factor_and_every_recovery_code():
    user = UserFactory(role='ADMIN')
    make_factor(user)
    mfa.new_recovery_codes(user)
    mfa.reset(user)
    assert mfa.is_enabled(user) is False
    assert not SecondFactor.objects.filter(user=user).exists()
    assert not RecoveryCode.objects.filter(user=user).exists()
