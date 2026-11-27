"""When a farmer or supervisor is reminded about two-step sign in, and when they are left alone.

The rules are one function of what it is given, tried here as a table. The endpoints keep what the person answered.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from core.mfa_prompt import TRIGGERS, should_prompt, snooze
from logs.models import SecurityEvent
from tests.factories import BatchFactory, FarmFactory, HarvestRecordFactory, UserFactory
from tests.mfa_helpers import PASSWORD, client_with, enable_factor, session_for, totp
from users.models import User, UserSession

STATUS = '/api/auth/mfa'
SNOOZE = '/api/auth/mfa/prompt'
SEEN = '/api/auth/mfa/prompt/seen'
LOGIN = '/api/auth/login'

NOW = timezone.now()
QUIET = {'enabled': False, 'shared_device': False, 'acting': False}


def someone(**fields):
    """A person who may be reminded, not saved: the rules read only these fields."""
    return User(**{'role': 'FARMER', 'phone': '+250780000001', 'mfa_prompt_dismissals': 0, **fields})


def days(n):
    return timedelta(days=n)


def hours(n):
    return timedelta(hours=n)


# ── never ───────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('trigger', TRIGGERS)
@pytest.mark.parametrize('person, given', [
    ({'role': 'ADMIN'}, {}),
    ({}, {'enabled': True}),
    ({}, {'acting': True}),
    ({}, {'shared_device': True}),
    ({'phone': None}, {}),
    ({'phone': ''}, {}),
    ({'deletion_requested_at': NOW}, {}),
], ids=['admin', 'already on', 'support visit', 'shared computer', 'no phone', 'empty phone', 'closing the account'])
def test_these_are_never_reminded(trigger, person, given):
    assert should_prompt(someone(**person), trigger, NOW, **{**QUIET, **given}) is False


def test_an_unknown_moment_reminds_nobody():
    assert should_prompt(someone(), 'birthday', NOW, **QUIET) is False


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
@pytest.mark.parametrize('trigger', TRIGGERS)
def test_a_person_who_was_never_asked_is_reminded_at_every_moment(role, trigger):
    assert should_prompt(someone(role=role), trigger, NOW, **QUIET) is True


# ── after "remind me later" ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('trigger', TRIGGERS)
def test_nothing_is_shown_twice_within_a_day(trigger):
    assert should_prompt(someone(mfa_prompted_at=NOW - hours(23)), trigger, NOW, **QUIET) is False
    assert should_prompt(someone(mfa_prompted_at=NOW - hours(25)), trigger, NOW, **QUIET) is True


@pytest.mark.parametrize('trigger', ['login', 'password_changed', 'sensitive_action'])
def test_a_put_off_reminder_stays_away_until_its_day(trigger):
    person = someone(mfa_prompt_dismissals=1, mfa_prompt_snoozed_until=NOW + days(3))
    assert should_prompt(person, trigger, NOW + days(2), **QUIET) is False
    assert should_prompt(person, trigger, NOW + days(3), **QUIET) is True


def test_after_three_put_offs_signing_in_never_reminds_again():
    person = someone(mfa_prompt_dismissals=3, mfa_prompt_snoozed_until=NOW)
    assert should_prompt(person, 'login', NOW + days(400), **QUIET) is False
    assert should_prompt(person, 'password_changed', NOW + days(400), **QUIET) is True
    assert should_prompt(person, 'sensitive_action', NOW + days(400), **QUIET) is True


def test_a_new_device_breaks_a_wait_at_most_once_in_seven_days():
    waiting = {'mfa_prompt_dismissals': 4, 'mfa_prompt_snoozed_until': NOW + days(60)}
    assert should_prompt(someone(**waiting), 'new_device', NOW, **QUIET) is True
    assert should_prompt(someone(**waiting, mfa_prompted_at=NOW - days(6)), 'new_device', NOW, **QUIET) is False
    assert should_prompt(someone(**waiting, mfa_prompted_at=NOW - days(8)), 'new_device', NOW, **QUIET) is True


@pytest.mark.django_db
def test_each_put_off_waits_longer():
    user = UserFactory(role='FARMER')
    waits = []
    for _ in range(5):
        waits.append((snooze(user, NOW) - NOW).days)
    user.refresh_from_db()
    assert waits == [3, 7, 30, 90, 90]
    assert user.mfa_prompt_dismissals == 5 and user.mfa_prompt_snoozed_until == NOW + days(90)


# ── the endpoints ───────────────────────────────────────────────────────────────────────────

def signed_in(user, **session):
    return client_with(user, session_for(user, **session))


def prompt(client, trigger=None):
    return client.get(STATUS, {'trigger': trigger} if trigger else {}).data['data']


@pytest.mark.django_db
def test_the_status_says_whether_to_remind_and_why():
    client = signed_in(UserFactory(role='FARMER'))
    assert prompt(client, 'login')['prompt'] == {'show': True, 'trigger': 'login'}
    assert prompt(client)['prompt'] == {'show': False, 'trigger': None}
    assert prompt(client, 'birthday')['prompt'] == {'show': False, 'trigger': None}


@pytest.mark.django_db
def test_asking_changes_nothing():
    user = UserFactory(role='FARMER')
    client = signed_in(user)
    prompt(client, 'login')
    user.refresh_from_db()
    assert user.mfa_prompted_at is None and user.mfa_prompt_dismissals == 0


@pytest.mark.django_db
def test_putting_it_off_is_kept_and_noted():
    user = UserFactory(role='SUPERVISOR')
    client = signed_in(user)
    response = client.post(SNOOZE, {'action': 'snooze'}, format='json')
    assert response.status_code == 200 and response.data['data']['snoozed_until']
    user.refresh_from_db()
    assert user.mfa_prompt_dismissals == 1
    assert SecurityEvent.objects.filter(kind='mfa_prompt_snoozed', user_id=user.pk).count() == 1
    assert prompt(client, 'login')['prompt']['show'] is False


@pytest.mark.django_db
def test_only_putting_off_is_an_answer():
    user = UserFactory(role='FARMER')
    assert signed_in(user).post(SNOOZE, {'action': 'never'}, format='json').status_code == 422
    user.refresh_from_db()
    assert user.mfa_prompt_dismissals == 0


@pytest.mark.django_db
def test_showing_it_is_remembered():
    user = UserFactory(role='FARMER')
    client = signed_in(user)
    assert client.post(SEEN, {}, format='json').status_code == 200
    user.refresh_from_db()
    assert user.mfa_prompted_at is not None
    assert prompt(client, 'password_changed')['prompt']['show'] is False


@pytest.mark.django_db
@pytest.mark.parametrize('url', [SNOOZE, SEEN])
def test_an_admin_has_no_reminder_to_answer(url):
    admin = UserFactory(role='ADMIN')
    enable_factor(admin)
    assert signed_in(admin, verified_minutes_ago=0).post(url, {'action': 'snooze'}, format='json').status_code == 403


@pytest.mark.django_db
def test_a_shared_computer_is_known_from_the_sign_in_itself():
    user = UserFactory(role='FARMER')
    session = session_for(user)
    UserSession.objects.filter(pk=session.pk).update(is_shared_device=True)
    data = prompt(client_with(user, session), 'login')
    assert data['prompt']['show'] is False and data['reminder_line'] is False


@pytest.mark.django_db
def test_the_quiet_line_shows_once_it_was_put_off_and_goes_when_it_is_on():
    user = UserFactory(role='FARMER')
    client = signed_in(user)
    assert prompt(client)['reminder_line'] is False
    client.post(SNOOZE, {'action': 'snooze'}, format='json')
    assert prompt(client)['reminder_line'] is True
    enable_factor(user)
    assert prompt(client)['reminder_line'] is False


@pytest.mark.django_db
def test_only_a_farmers_first_shared_lot_is_a_moment_to_remind():
    farmer = UserFactory(role='FARMER')
    lot = HarvestRecordFactory(batch=BatchFactory(farm=FarmFactory(owner=farmer)))
    HarvestRecordFactory(shared_at=NOW)   # somebody else's shared lot says nothing about this farmer
    client = signed_in(farmer)
    assert prompt(client, 'sensitive_action')['prompt']['show'] is True
    type(lot).objects.filter(pk=lot.pk).update(shared_at=NOW)
    assert prompt(client, 'sensitive_action')['prompt']['show'] is False
    assert prompt(client, 'login')['prompt']['show'] is True


# ── what sign in says ───────────────────────────────────────────────────────────────────────

PHONE = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'


def sign_in(user, agent):
    response = APIClient().post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json', HTTP_USER_AGENT=agent)
    return response.json()['data']


@pytest.mark.django_db
def test_sign_in_says_when_the_device_is_new():
    user = UserFactory(role='FARMER')
    assert sign_in(user, PHONE)['newDevice'] is False   # the first ever is not news
    assert sign_in(user, PHONE)['newDevice'] is False
    assert sign_in(user, DESKTOP)['newDevice'] is True


@pytest.mark.django_db
def test_the_code_step_says_so_too():
    user = UserFactory(role='FARMER')
    sign_in(user, PHONE)
    secret = enable_factor(user)
    client = APIClient()
    first = client.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json', HTTP_USER_AGENT=DESKTOP)
    done = client.post('/api/auth/mfa/verify', {'challenge': first.json()['data']['mfa']['challenge'], 'code': totp(secret)},
                       format='json', HTTP_USER_AGENT=DESKTOP)
    assert done.json()['data']['newDevice'] is True
