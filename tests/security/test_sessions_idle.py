"""A sign in that nobody uses is ended, sooner for people with more power. The server decides, the screen only warns."""
from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from tests.factories import UserFactory
from tests.mfa_helpers import sign_in_admin
from users.models import UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
REFRESH = '/api/auth/token/refresh'
ME = '/api/auth/me'


def sign_in(user):
    client = APIClient()
    # An admin signs in with a password and then a code.
    response = sign_in_admin(client, user) if user.role == 'ADMIN' else client.post(LOGIN, {'email': user.email, 'password': 'Pass1234'}, format='json')
    assert response.status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.json()["data"]["token"]}')
    return client


def idle_for(user, **delta):
    """Make the person's last activity that long ago."""
    UserSession.objects.filter(user=user).update(last_activity_at=timezone.now() - timedelta(**delta))


def activity_of(user):
    return UserSession.objects.get(user=user).last_activity_at


def test_the_limits_are_the_ones_we_decided(settings):
    assert settings.SESSION_IDLE_MINUTES == {'ADMIN': 15, 'SUPERVISOR': 30, 'FARMER': None}


def test_an_admin_idle_for_16_minutes_is_refused_and_told_why():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, minutes=16)
    response = client.get(ME)
    assert response.status_code == 401
    assert response.json()['code'] == 'session_idle'


def test_an_admin_idle_for_14_minutes_is_accepted():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, minutes=14)
    assert client.get(ME).status_code == 200


@pytest.mark.parametrize('minutes, expected', [(29, 200), (31, 401)])
def test_a_supervisor_has_thirty_minutes(minutes, expected):
    supervisor = UserFactory(role='SUPERVISOR')
    client = sign_in(supervisor)
    idle_for(supervisor, minutes=minutes)
    assert client.get(ME).status_code == expected


def test_a_farmer_is_never_refused_for_sitting_idle():
    farmer = UserFactory(role='FARMER')
    client = sign_in(farmer)
    idle_for(farmer, days=10)
    assert client.get(ME).status_code == 200


def test_a_request_inside_the_limit_moves_the_clock():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, minutes=10)
    before = timezone.now()
    assert client.get(ME).status_code == 200
    assert activity_of(admin) >= before


def test_the_clock_is_written_at_most_once_a_minute():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, minutes=10)
    with CaptureQueriesContext(connection) as queries:
        for _ in range(5):
            assert client.get(ME).status_code == 200
    writes = [q for q in queries if q['sql'].startswith('UPDATE') and 'user_sessions' in q['sql']]
    assert len(writes) == 1


def test_a_request_in_the_same_minute_leaves_the_clock_alone():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, seconds=20)
    marked = activity_of(admin)
    client.get(ME)
    assert activity_of(admin) == marked


def test_a_refused_request_does_not_move_the_clock():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, minutes=16)
    marked = activity_of(admin)
    client.get(ME)
    assert activity_of(admin) == marked


def test_the_limit_can_be_changed_in_settings(settings):
    settings.SESSION_IDLE_MINUTES = {'ADMIN': 1, 'SUPERVISOR': 30, 'FARMER': None}
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, minutes=2)
    assert client.get(ME).status_code == 401


def test_an_idle_session_cannot_be_renewed_and_the_audit_log_says_why():
    admin = UserFactory(role='ADMIN')
    browser = APIClient()
    sign_in_admin(browser, admin)
    idle_for(admin, minutes=16)
    response = browser.post(REFRESH)
    assert response.status_code == 401
    assert response.json()['reason'] == 'idle'
    entry = AuditLog.objects.filter(user=admin).order_by('-created_at').first()
    assert 'idle' in entry.detail.lower()
    assert UserSession.objects.get(user=admin).revoked_at is not None


def test_a_renewal_inside_the_limit_still_works_and_is_not_activity():
    admin = UserFactory(role='ADMIN')
    browser = APIClient()
    sign_in_admin(browser, admin)
    idle_for(admin, minutes=10)
    marked = activity_of(admin)
    assert browser.post(REFRESH).status_code == 200
    # A silent renewal is the page asking, not the person.
    assert activity_of(admin) == marked


def test_a_token_from_before_sessions_existed_is_not_judged_by_idleness(settings):
    from rest_framework_simplejwt.tokens import AccessToken
    # A supervisor: an admin's token with no session is refused on purpose now (tests/test_mfa_enforcement.py).
    supervisor = UserFactory(role='SUPERVISOR')
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(supervisor)}')
    assert client.get(ME).status_code == 200
