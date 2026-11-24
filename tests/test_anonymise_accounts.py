"""The nightly job that anonymises accounts whose thirty days have passed.

Anonymising removes what says who the person was and keeps what they did: farms, rooms, batches and harvests stay as history,
without a name. The email and the number are freed. Running it twice changes nothing more.
"""
from datetime import timedelta
from io import StringIO
from unittest import mock

import pytest
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from batches.models import Batch
from cooperatives.models import CooperativeMembership
from logs.models import JobLog, SecurityEvent
from sensors.models import IoTDevice
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, IoTDeviceFactory, UserFactory
from users import closure
from users.models import EmailChange, NotificationPreference, RecoveryCode, SecondFactor, User, UserSession

pytestmark = pytest.mark.django_db

GRACE = settings.ACCOUNT_DELETION_GRACE_DAYS


def scheduled(days_ago: float, **fields):
    """A person who asked to close their account `days_ago` days ago."""
    person = UserFactory(**fields)
    User.objects.filter(pk=person.pk).update(deletion_requested_at=timezone.now() - timedelta(days=days_ago))
    person.refresh_from_db()
    return person


def run(*args):
    out = StringIO()
    call_command('anonymise_accounts', *args, stdout=out)
    return out.getvalue()


# ── who is due ───────────────────────────────────────────────────────────────────────────────

def test_only_accounts_past_the_grace_days_and_not_cancelled_are_anonymised():
    soon = scheduled(GRACE - 1)
    due = scheduled(GRACE + 1)
    cancelled = UserFactory()
    plain = UserFactory()
    run()
    for person in (soon, due, cancelled, plain):
        person.refresh_from_db()
    assert due.anonymised_at is not None
    assert soon.anonymised_at is None and cancelled.anonymised_at is None and plain.anonymised_at is None
    assert soon.is_active and cancelled.is_active and plain.is_active


def test_due_accounts_lists_the_same_people_the_job_changes():
    scheduled(GRACE - 1)
    due = scheduled(GRACE + 1)
    assert list(closure.due_accounts()) == [due]
    assert list(closure.due_accounts(now=timezone.now() - timedelta(days=5))) == []


# ── what is removed ──────────────────────────────────────────────────────────────────────────

def test_anonymising_removes_every_personal_field():
    person = scheduled(
        GRACE + 1, name='Aline Uwase', email='aline@example.rw', photo_url='https://example.rw/a.jpg', preferred_language='fr',
        cooperative=CooperativeFactory(),
    )
    User.objects.filter(pk=person.pk).update(phone_verified_at=timezone.now(), mfa_prompted_at=timezone.now())
    run()
    person.refresh_from_db()
    assert person.name == 'Former member'
    assert person.email == f'deleted-{person.pk}@deleted.invalid'
    assert not person.has_usable_password()
    assert person.phone is None and person.phone_verified_at is None and person.photo_url is None
    assert person.is_active is False and person.is_email_verified is False
    assert person.preferred_language == 'en'
    assert person.cooperative_id is None
    assert person.anonymised_at is not None
    assert person.mfa_prompted_at is None


def test_it_deletes_sessions_recovery_codes_second_factor_and_notification_preferences():
    person = scheduled(GRACE + 1)
    now = timezone.now()
    UserSession.objects.create(user=person, last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now))
    RecoveryCode.objects.create(user=person, code_hash='x' * 64)
    SecondFactor.objects.create(user=person, secret_encrypted='secret')
    NotificationPreference.objects.create(user=person, sms=True)
    EmailChange.objects.create(user=person, old_email='old@example.rw', new_email='new@example.rw')
    run()
    assert not UserSession.objects.filter(user=person).exists()
    assert not RecoveryCode.objects.filter(user=person).exists()
    assert not SecondFactor.objects.filter(user=person).exists()
    assert not NotificationPreference.objects.filter(user=person).exists()
    assert not EmailChange.objects.filter(user=person).exists()


def test_it_closes_the_membership_and_leaves_farms_rooms_batches_and_harvests_untouched():
    coop = CooperativeFactory()
    person = scheduled(GRACE + 1, cooperative=coop)
    farm = FarmFactory(owner=person, name='Hill Farm')
    batch = BatchFactory(farm=farm)
    assert CooperativeMembership.objects.filter(user=person, ended_at__isnull=True).count() == 1
    run()
    assert not CooperativeMembership.objects.filter(user=person, ended_at__isnull=True).exists()
    assert CooperativeMembership.objects.filter(user=person, cooperative=coop).count() == 1
    farm.refresh_from_db()
    assert farm.owner_id == person.pk and farm.name == 'Hill Farm'
    assert Batch.objects.filter(pk=batch.pk, farm=farm).exists()


def test_it_deactivates_the_persons_sensor_devices():
    person = scheduled(GRACE + 1)
    mine = IoTDeviceFactory(farm=FarmFactory(owner=person))
    others = IoTDeviceFactory(farm=FarmFactory(owner=UserFactory()))
    run()
    mine.refresh_from_db()
    others.refresh_from_db()
    assert mine.is_active is False
    assert others.is_active is True
    assert IoTDevice.objects.count() == 2


def test_the_number_and_the_email_can_be_used_again_and_many_anonymised_accounts_do_not_collide():
    people = [scheduled(GRACE + 1, email=f'p{n}@example.rw', phone=f'+25078100000{n}') for n in range(3)]
    run()
    emails = set(User.objects.filter(pk__in=[p.pk for p in people]).values_list('email', flat=True))
    assert len(emails) == 3
    again = UserFactory(email='p0@example.rw', phone='+250781000000')
    assert again.pk not in {p.pk for p in people}


def test_running_it_twice_changes_nothing_more():
    person = scheduled(GRACE + 1)
    run()
    person.refresh_from_db()
    first = (person.anonymised_at, person.email, person.updated_at)
    assert 'anonymised 0' in run().lower()
    person.refresh_from_db()
    assert (person.anonymised_at, person.email, person.updated_at) == first
    assert SecurityEvent.objects.filter(kind='account_anonymised').count() == 1


def test_anonymise_is_idempotent_when_called_on_an_account_that_is_done():
    person = scheduled(GRACE + 1)
    first = closure.anonymise(person)
    again = closure.anonymise(person)
    assert first.anonymised_at is not None
    assert again.anonymised_at == first.anonymised_at


def test_dry_run_changes_nothing_and_says_how_many_it_would():
    scheduled(GRACE + 1)
    scheduled(GRACE + 2)
    said = run('--dry-run')
    assert '2' in said and 'would' in said.lower()
    assert not User.objects.filter(anonymised_at__isnull=False).exists()
    assert not SecurityEvent.objects.filter(kind='account_anonymised').exists()


# ── the record ───────────────────────────────────────────────────────────────────────────────

def test_it_writes_a_start_and_an_end_row_to_the_jobs_log_and_a_security_event_per_account():
    scheduled(GRACE + 1)
    scheduled(GRACE + 1)
    run()
    kinds = set(JobLog.objects.filter(subject='anonymise_accounts').values_list('kind', flat=True))
    assert {'command_started', 'command_finished'} <= kinds
    events = SecurityEvent.objects.filter(kind='account_anonymised')
    assert events.count() == 2
    for event in events:
        assert '@example.rw' not in event.user_email and '@example.rw' not in event.detail


def test_a_failure_on_one_account_does_not_stop_the_others():
    first, second = scheduled(GRACE + 2), scheduled(GRACE + 1)
    real = closure.anonymise
    calls = []

    def flaky(user, *args, **kwargs):
        calls.append(user.pk)
        if len(calls) == 1:
            raise RuntimeError('boom')
        return real(user, *args, **kwargs)

    with mock.patch('users.closure.anonymise', side_effect=flaky):
        with pytest.raises(CommandError):
            run()
    first.refresh_from_db()
    second.refresh_from_db()
    assert len(calls) == 2
    assert sum(p.anonymised_at is not None for p in (first, second)) == 1
    assert JobLog.objects.filter(subject='anonymise_accounts', kind='command_failed').exists()
