"""An admin resets two-step sign in for anyone who lost their phone and their recovery codes."""
import pytest
from django.core import mail

from core import mail_words
from logs.models import SecurityEvent
from tests.factories import UserFactory
from tests.mfa_helpers import client_with, enable_factor, session_for
from users import mfa
from users.models import RecoveryCode, SecondFactor, UserSession

pytestmark = pytest.mark.django_db

USERS = '/api/admin/users'


def reset_url(user):
    return f'/api/admin/users/{user.pk}/mfa/reset'


def admin_client(verified_minutes_ago=0):
    admin = UserFactory(role='ADMIN', name='Aline Admin')
    enable_factor(admin)
    return client_with(admin, session_for(admin, verified_minutes_ago=verified_minutes_ago))


def person_with_it_on(role='FARMER', **fields):
    user = UserFactory(role=role, **fields)
    enable_factor(user)
    mfa.new_recovery_codes(user)
    session_for(user, verified_minutes_ago=0)
    return user


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_an_admin_resets_a_farmer_or_supervisor(role):
    person = person_with_it_on(role)
    response = admin_client().post(reset_url(person))
    assert response.status_code == 200, response.data
    assert not SecondFactor.objects.filter(user=person).exists() and not RecoveryCode.objects.filter(user=person).exists()
    assert not UserSession.objects.filter(user=person, revoked_at__isnull=True).exists()
    assert SecurityEvent.objects.filter(kind='mfa_reset', user_id=person.pk).count() == 1
    message = mail.outbox[-1]
    words = mail_words.WORDS['en']
    assert message.to == [person.email] and message.subject == words['mfa_reset_subject']
    assert words['mfa_reset_again'] in message.body and words['mfa_reset_admin'] not in message.body
    assert 'Aline Admin' in message.body


def test_an_admin_is_still_told_to_set_it_up_again():
    other = person_with_it_on('ADMIN')
    admin_client().post(reset_url(other))
    words = mail_words.WORDS['en']
    assert words['mfa_reset_admin'] in mail.outbox[-1].body and words['mfa_reset_again'] not in mail.outbox[-1].body


@pytest.mark.parametrize('lang', ['fr', 'rw'])
def test_the_email_is_in_the_persons_language(lang):
    person = person_with_it_on(preferred_language=lang)
    admin_client().post(reset_url(person))
    words = mail_words.WORDS[lang]
    assert mail.outbox[-1].subject == words['mfa_reset_subject'] and words['mfa_reset_again'] in mail.outbox[-1].body


def test_the_caller_needs_a_recent_code():
    person = person_with_it_on()
    response = admin_client(verified_minutes_ago=60).post(reset_url(person))
    assert response.status_code == 403 and response.data['code'] == 'mfa_recent_required'
    assert mfa.is_enabled(person)


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_nobody_else_can_reset_anyone(role):
    caller = UserFactory(role=role)
    person = person_with_it_on()
    assert client_with(caller, session_for(caller)).post(reset_url(person)).status_code == 403
    assert mfa.is_enabled(person)


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR', 'ADMIN'])
def test_someone_with_no_authenticator_is_not_found(role):
    assert admin_client().post(reset_url(UserFactory(role=role))).status_code == 404


def test_the_user_list_says_who_has_it_on():
    on, off = person_with_it_on(), UserFactory(role='SUPERVISOR')
    started = UserFactory(role='FARMER')
    SecondFactor.objects.create(user=started, pending_secret_encrypted=mfa.encrypt(mfa.new_secret()))   # not confirmed
    rows = {row['id']: row for row in admin_client().get(USERS).data['data']}
    assert (rows[on.pk]['mfa_enabled'], rows[off.pk]['mfa_enabled'], rows[started.pk]['mfa_enabled']) == (True, False, False)
    assert 'secret' not in str(rows[on.pk]).lower()


def test_the_list_asks_the_database_no_more_for_five_people_than_for_one(django_assert_num_queries):
    client = admin_client()
    person_with_it_on()
    from django.db import connection
    from django.test.utils import CaptureQueriesContext
    client.get(USERS)   # the first call also marks the sign in as active
    with CaptureQueriesContext(connection) as few:
        client.get(USERS)
    for _ in range(4):
        person_with_it_on()
    with django_assert_num_queries(len(few)):
        client.get(USERS)
