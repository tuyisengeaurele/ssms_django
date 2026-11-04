"""Reading a long page makes no request, so the page tells the server now and then that somebody is still there."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
PING = '/api/auth/session/ping'


def sign_in(user):
    client = APIClient()
    response = client.post(LOGIN, {'email': user.email, 'password': 'Pass1234'}, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.json()["data"]["token"]}')
    return client


def idle_for(user, **delta):
    UserSession.objects.filter(user=user).update(last_activity_at=timezone.now() - timedelta(**delta))


def test_a_ping_counts_as_activity_even_inside_the_same_minute():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, seconds=30)
    before = timezone.now()
    assert client.post(PING).status_code == 200
    assert UserSession.objects.get(user=admin).last_activity_at >= before


def test_an_admin_is_told_the_limit_and_how_much_is_left():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, minutes=5)
    answer = client.post(PING).json()['data']
    assert answer['idleLimitSeconds'] == 900
    # The ping is activity, so the clock starts again.
    assert 890 <= answer['idleSecondsLeft'] <= 900


def test_a_supervisor_has_half_an_hour():
    supervisor = UserFactory(role='SUPERVISOR')
    assert sign_in(supervisor).post(PING).json()['data']['idleLimitSeconds'] == 1800


def test_a_farmer_has_no_limit_to_be_told_about():
    client = sign_in(UserFactory(role='FARMER'))
    assert client.post(PING).json()['data'] == {'idleLimitSeconds': None, 'idleSecondsLeft': None}


def test_a_ping_cannot_keep_an_idle_session_alive():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    idle_for(admin, minutes=16)
    response = client.post(PING)
    assert response.status_code == 401
    assert response.json()['code'] == 'session_idle'


def test_a_signed_out_device_gets_a_401():
    admin = UserFactory(role='ADMIN')
    client = sign_in(admin)
    UserSession.objects.filter(user=admin).update(revoked_at=timezone.now())
    assert client.post(PING).status_code == 401


def test_a_stranger_gets_a_401():
    assert APIClient().post(PING).status_code == 401


def test_a_ping_only_works_as_a_post():
    client = sign_in(UserFactory(role='ADMIN'))
    assert client.get(PING).status_code == 405
