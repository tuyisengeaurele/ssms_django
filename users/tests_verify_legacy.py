from datetime import datetime, timezone
from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from tests.factories import UserFactory
from users.models import User

pytestmark = pytest.mark.django_db


def made_on(user, day):
    """created_at is set automatically, so move it after the fact."""
    User.objects.filter(pk=user.pk).update(created_at=datetime.fromisoformat(day).replace(tzinfo=timezone.utc))
    user.refresh_from_db()
    return user


def run(*args):
    out = StringIO()
    call_command('verify_legacy_users', *args, stdout=out)
    return out.getvalue()


def test_users_created_before_the_date_are_verified_and_listed():
    old = made_on(UserFactory(email='old@example.rw', is_email_verified=False), '2026-05-01')
    out = run('--before', '2026-05-16')
    old.refresh_from_db()
    assert old.is_email_verified is True
    assert 'old@example.rw' in out
    assert '1 account' in out


def test_users_created_on_or_after_the_date_are_left_alone():
    on_day = made_on(UserFactory(email='day@example.rw', is_email_verified=False), '2026-05-16')
    later = made_on(UserFactory(email='later@example.rw', is_email_verified=False), '2026-06-01')
    out = run('--before', '2026-05-16')
    for user in (on_day, later):
        user.refresh_from_db()
        assert user.is_email_verified is False
    assert 'day@example.rw' not in out and 'later@example.rw' not in out
    assert '0 account' in out


def test_dry_run_changes_nothing_and_says_what_it_would_do():
    old = made_on(UserFactory(email='old@example.rw', is_email_verified=False), '2026-05-01')
    out = run('--before', '2026-05-16', '--dry-run')
    old.refresh_from_db()
    assert old.is_email_verified is False
    assert 'old@example.rw' in out
    assert 'Would verify 1 account' in out


def test_accounts_that_are_already_verified_or_turned_off_are_skipped():
    verified = made_on(UserFactory(email='v@example.rw', is_email_verified=True), '2026-05-01')
    off = made_on(UserFactory(email='off@example.rw', is_email_verified=False, is_active=False), '2026-05-01')
    out = run('--before', '2026-05-16')
    off.refresh_from_db()
    assert off.is_email_verified is False
    assert 'v@example.rw' not in out and 'off@example.rw' not in out
    assert verified.is_email_verified is True


def test_running_it_twice_is_harmless():
    made_on(UserFactory(email='old@example.rw', is_email_verified=False), '2026-05-01')
    run('--before', '2026-05-16')
    assert '0 account' in run('--before', '2026-05-16')


@pytest.mark.parametrize('bad', ['garbage', '2026-13-01', '16/05/2026'])
def test_a_bad_date_is_a_clear_error(bad):
    with pytest.raises(CommandError, match='YYYY-MM-DD'):
        run('--before', bad)


def test_the_date_is_required():
    with pytest.raises(CommandError):
        run()
