"""How a person wants to be reached: in the app, by email, by SMS, by WhatsApp, and when not to be disturbed.

Defaults when nothing is saved: in app on, email on, SMS off, WhatsApp off, no quiet hours. Reading never writes a row. The
in app inbox cannot be turned off, because a disease alert must always reach the person somewhere. Quiet hours are clock
times in Kigali (UTC+2, no daylight saving) and may run past midnight.
"""
from datetime import time

import pytest
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction

from audit_log.models import AuditLog
from tests.factories import UserFactory
from users.models import NotificationPreference
from users.notification_preferences import DEFAULTS, preferences_for

pytestmark = pytest.mark.django_db

URL = '/api/auth/me/notifications'


def test_a_person_with_nothing_saved_gets_the_defaults_and_no_row_is_written():
    user = UserFactory()
    assert preferences_for(user) == {
        'in_app': True, 'email': True, 'sms': False, 'whatsapp': False, 'quiet_start': None, 'quiet_end': None,
    }
    assert preferences_for(user) == DEFAULTS
    assert not NotificationPreference.objects.exists()


def test_the_defaults_are_not_shared_between_callers():
    first = preferences_for(UserFactory())
    first['sms'] = True
    assert preferences_for(UserFactory())['sms'] is False


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR', 'ADMIN'])
def test_every_role_reads_its_own_preferences(auth_client, role):
    response = auth_client(UserFactory(role=role)).get(URL)
    assert response.status_code == 200
    assert response.data['data'] == DEFAULTS


def test_a_stranger_is_asked_to_sign_in(api_client):
    assert api_client.get(URL).status_code == 401
    assert api_client.patch(URL, {'sms': True}, format='json').status_code == 401


def test_a_change_is_saved_and_the_rest_stays_as_it_was(auth_client):
    user = UserFactory()
    client = auth_client(user)
    assert client.patch(URL, {'sms': True}, format='json').status_code == 200
    assert client.patch(URL, {'whatsapp': True, 'email': False}, format='json').status_code == 200
    saved = client.get(URL).data['data']
    assert saved == {**DEFAULTS, 'sms': True, 'whatsapp': True, 'email': False}
    assert NotificationPreference.objects.filter(user=user).count() == 1
    assert preferences_for(user) == saved


def test_the_answer_to_a_change_is_the_new_state(auth_client):
    response = auth_client(UserFactory()).patch(URL, {'sms': True}, format='json')
    assert response.data['data']['sms'] is True


def test_one_person_cannot_change_another(auth_client):
    mine, other = UserFactory(), UserFactory()
    auth_client(mine).patch(URL, {'sms': True}, format='json')
    assert preferences_for(other)['sms'] is False


def test_the_in_app_inbox_cannot_be_turned_off(auth_client):
    response = auth_client(UserFactory()).patch(URL, {'in_app': False}, format='json')
    assert response.status_code == 422
    assert 'in_app' in response.data['errors']


def test_in_app_can_be_sent_as_on(auth_client):
    assert auth_client(UserFactory()).patch(URL, {'in_app': True}, format='json').status_code == 200


@pytest.mark.parametrize('field', ['email', 'sms', 'whatsapp'])
def test_a_switch_must_be_true_or_false(auth_client, field):
    response = auth_client(UserFactory()).patch(URL, {field: 'maybe'}, format='json')
    assert response.status_code == 422
    assert field in response.data['errors']


def test_quiet_hours_are_saved_and_may_run_past_midnight(auth_client):
    user = UserFactory()
    response = auth_client(user).patch(URL, {'quiet_start': '21:00', 'quiet_end': '06:00'}, format='json')
    assert response.status_code == 200
    assert response.data['data']['quiet_start'] == '21:00'
    assert response.data['data']['quiet_end'] == '06:00'
    row = NotificationPreference.objects.get(user=user)
    assert (row.quiet_start, row.quiet_end) == (time(21, 0), time(6, 0))


@pytest.mark.parametrize('body', [
    {'quiet_start': '21:00'},                        # one end alone
    {'quiet_end': '06:00'},
    {'quiet_start': '21:00', 'quiet_end': '21:00'},  # an empty window
    {'quiet_start': '25:00', 'quiet_end': '06:00'},  # not a time
    {'quiet_start': 'night', 'quiet_end': '06:00'},
])
def test_quiet_hours_need_two_different_times(auth_client, body):
    response = auth_client(UserFactory()).patch(URL, body, format='json')
    assert response.status_code == 422
    assert 'quiet_hours' in response.data['errors'] or set(body) & set(response.data['errors'])


def test_one_end_can_change_when_the_other_is_already_saved(auth_client):
    client = auth_client(UserFactory())
    client.patch(URL, {'quiet_start': '21:00', 'quiet_end': '06:00'}, format='json')
    response = client.patch(URL, {'quiet_end': '05:30'}, format='json')
    assert response.status_code == 200
    assert response.data['data']['quiet_start'] == '21:00'
    assert response.data['data']['quiet_end'] == '05:30'


def test_quiet_hours_are_cleared_with_two_nulls(auth_client):
    client = auth_client(UserFactory())
    client.patch(URL, {'quiet_start': '21:00', 'quiet_end': '06:00'}, format='json')
    response = client.patch(URL, {'quiet_start': None, 'quiet_end': None}, format='json')
    assert response.status_code == 200
    assert response.data['data']['quiet_start'] is None and response.data['data']['quiet_end'] is None


def test_clearing_only_one_end_is_refused(auth_client):
    client = auth_client(UserFactory())
    client.patch(URL, {'quiet_start': '21:00', 'quiet_end': '06:00'}, format='json')
    assert client.patch(URL, {'quiet_start': None}, format='json').status_code == 422


def test_a_refused_change_saves_nothing(auth_client):
    user = UserFactory()
    auth_client(user).patch(URL, {'sms': True, 'quiet_start': '21:00'}, format='json')
    assert not NotificationPreference.objects.exists()
    assert preferences_for(user)['sms'] is False


def test_a_change_is_written_to_the_audit_log(auth_client):
    user = UserFactory()
    auth_client(user).patch(URL, {'sms': True}, format='json')
    entry = AuditLog.objects.filter(user=user, action='UPDATE').latest('created_at')
    assert 'notification' in entry.detail.lower()
    assert entry.changes == {'sms': {'from': False, 'to': True}}


@pytest.mark.parametrize('bad', [
    {'quiet_start': time(21, 0)},
    {'quiet_start': time(21, 0), 'quiet_end': time(21, 0)},
    {'in_app': False},
])
def test_the_database_refuses_a_bad_row_even_when_the_api_is_bypassed(bad):
    with pytest.raises(IntegrityError), transaction.atomic():
        NotificationPreference.objects.create(user=UserFactory(), **bad)


@pytest.mark.django_db(transaction=True)
def test_the_migration_applies_and_reverses():
    try:
        call_command('migrate', 'users', '0012', verbosity=0)
        assert 'notification_preferences' not in set(connection.introspection.table_names())
    finally:
        call_command('migrate', verbosity=0)
    assert 'notification_preferences' in set(connection.introspection.table_names())
