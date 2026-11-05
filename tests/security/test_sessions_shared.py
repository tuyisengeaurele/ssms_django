"""A tick at sign in says the computer is shared. A forgotten sign in on one is the risk, so the idle limit applies."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from tests.factories import UserFactory
from tests.mfa_helpers import sign_in_admin
from users.models import UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
REFRESH = '/api/auth/token/refresh'
ME = '/api/auth/me'
PING = '/api/auth/session/ping'
SESSIONS = '/api/auth/sessions'


def browser(user, **extra):
    client = APIClient()
    if user.role == 'ADMIN':
        response = sign_in_admin(client, user, **extra)
    else:
        response = client.post(LOGIN, {'email': user.email, 'password': 'Pass1234', **extra}, format='json')
    assert response.status_code == 200, response.content
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.json()["data"]["token"]}')
    return client


def idle_for(user, **delta):
    UserSession.objects.filter(user=user).update(last_activity_at=timezone.now() - timedelta(**delta))


def test_the_tick_is_remembered_on_the_session():
    farmer = UserFactory(role='FARMER')
    browser(farmer, sharedDevice=True)
    assert UserSession.objects.get(user=farmer).is_shared_device is True


@pytest.mark.parametrize('extra', [{}, {'sharedDevice': False}, {'sharedDevice': 'yes'}, {'sharedDevice': 1}, {'sharedDevice': None}])
def test_anything_but_a_real_tick_is_not_shared(extra):
    farmer = UserFactory(role='FARMER')
    browser(farmer, **extra)
    assert UserSession.objects.get(user=farmer).is_shared_device is False


@pytest.mark.parametrize('minutes, expected', [(29, 200), (31, 401)])
def test_a_farmer_on_a_shared_computer_has_half_an_hour(minutes, expected):
    farmer = UserFactory(role='FARMER')
    client = browser(farmer, sharedDevice=True)
    idle_for(farmer, minutes=minutes)
    response = client.get(ME)
    assert response.status_code == expected
    if expected == 401:
        assert response.json()['code'] == 'session_idle'


def test_a_farmer_on_their_own_phone_still_has_no_limit():
    farmer = UserFactory(role='FARMER')
    client = browser(farmer)
    idle_for(farmer, days=10)
    assert client.get(ME).status_code == 200


def test_the_tick_never_loosens_a_stricter_limit():
    admin = UserFactory(role='ADMIN')
    client = browser(admin, sharedDevice=True)
    idle_for(admin, minutes=16)
    assert client.get(ME).status_code == 401


def test_a_supervisor_keeps_half_an_hour_with_or_without_the_tick():
    supervisor = UserFactory(role='SUPERVISOR')
    client = browser(supervisor, sharedDevice=True)
    idle_for(supervisor, minutes=29)
    assert client.get(ME).status_code == 200


def test_the_shared_limit_can_be_changed_in_settings(settings):
    settings.SESSION_IDLE_SHARED_MINUTES = 5
    farmer = UserFactory(role='FARMER')
    client = browser(farmer, sharedDevice=True)
    idle_for(farmer, minutes=6)
    assert client.get(ME).status_code == 401


def test_the_ping_tells_a_shared_farmer_the_limit():
    farmer = UserFactory(role='FARMER')
    client = browser(farmer, sharedDevice=True)
    assert client.post(PING).json()['data']['idleLimitSeconds'] == 1800


def test_the_ping_tells_an_ordinary_farmer_there_is_none():
    client = browser(UserFactory(role='FARMER'))
    assert client.post(PING).json()['data']['idleLimitSeconds'] is None


def test_a_renewal_keeps_the_tick_and_refuses_an_idle_shared_session():
    farmer = UserFactory(role='FARMER')
    page = APIClient()
    page.post(LOGIN, {'email': farmer.email, 'password': 'Pass1234', 'sharedDevice': True}, format='json')
    assert page.post(REFRESH).status_code == 200
    assert UserSession.objects.get(user=farmer).is_shared_device is True
    idle_for(farmer, minutes=31)
    refused = page.post(REFRESH)
    assert refused.status_code == 401 and refused.json()['reason'] == 'idle'


def test_the_devices_list_says_which_is_shared():
    farmer = UserFactory(role='FARMER')
    client = browser(farmer, sharedDevice=True)
    rows = client.get(SESSIONS).json()['data']
    assert [r['isSharedDevice'] for r in rows] == [True]


def test_a_password_change_keeps_this_device_shared():
    farmer = UserFactory(role='FARMER')
    client = browser(farmer, sharedDevice=True)
    response = client.patch('/api/auth/change-password', {
        'currentPassword': 'Pass1234', 'newPassword': 'Brand-new-1234', 'confirmPassword': 'Brand-new-1234',
    }, format='json')
    assert response.status_code == 200, response.content
    live = UserSession.objects.filter(user=farmer, revoked_at__isnull=True)
    assert [s.is_shared_device for s in live] == [True]
