"""The security log: sign ins, lockouts, password changes, new devices, ended sessions, refusals and slow downs."""
from unittest import mock

import pytest
from rest_framework.test import APIClient, APIRequestFactory

from logs.models import SecurityEvent
from logs.security import KINDS, record_security_event
from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
REFRESH = '/api/auth/token/refresh'
CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppData Chrome/130.0.0.0 Safari/537.36'
FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'


def kinds():
    return list(SecurityEvent.objects.order_by('id').values_list('kind', flat=True))


def last():
    return SecurityEvent.objects.order_by('-id').first()


def sign_in(user, agent=CHROME, password='Pass1234'):
    client = APIClient()
    client.defaults['HTTP_USER_AGENT'] = agent
    response = client.post(LOGIN, {'email': user.email, 'password': password}, format='json')
    return client, response


# ── the writer ──────────────────────────────────────────────────────────────────────────────

def test_an_event_keeps_who_what_where_and_the_reference():
    user = UserFactory()
    request = APIRequestFactory().post('/x', REMOTE_ADDR='203.0.113.9')
    request.request_id = 'REF123456789'
    record_security_event('login_ok', request, user=user, detail='Signed in')
    event = last()
    assert (event.kind, event.user_id, event.user_email, event.ip_address) == ('login_ok', user.pk, user.email, '203.0.113.9')
    assert event.detail == 'Signed in'


def test_an_event_without_a_person_is_kept_too():
    record_security_event('login_failed', APIRequestFactory().post('/x'), detail='nobody@example.rw')
    assert last().user_id is None and last().user_email == ''


def test_long_detail_is_cut():
    record_security_event('throttled', APIRequestFactory().post('/x'), detail='x' * 5000)
    assert len(last().detail) <= 300


def test_a_failing_write_never_breaks_the_request():
    with mock.patch('logs.security.SecurityEvent.objects.create', side_effect=RuntimeError('database is down')):
        assert record_security_event('login_ok', APIRequestFactory().post('/x')) is None


def test_every_kind_has_a_plain_label():
    assert {'login_ok', 'login_failed', 'lockout', 'password_changed', 'reset_requested', 'new_device',
            'session_revoked', 'session_reused', 'session_idle', 'permission_denied', 'throttled'} <= set(KINDS)


# ── the places that write ───────────────────────────────────────────────────────────────────

def test_signing_in_is_recorded():
    user = UserFactory()
    sign_in(user)
    assert kinds() == ['login_ok']
    assert last().user_id == user.pk


def test_a_wrong_password_is_recorded_without_the_password():
    user = UserFactory()
    sign_in(user, password='Wrong-guess-123')
    assert kinds() == ['login_failed']
    event = last()
    assert 'Wrong-guess-123' not in event.detail and 'Wrong-guess-123' not in event.user_email
    assert user.email in event.detail


def test_a_locked_account_is_recorded():
    user = UserFactory()
    with mock.patch('users.views.lockout.is_locked', return_value=120):
        sign_in(user)
    assert 'lockout' in kinds()


def test_a_new_device_is_recorded_but_the_first_is_not():
    user = UserFactory()
    sign_in(user, CHROME)
    assert 'new_device' not in kinds()
    sign_in(user, FIREFOX)
    assert 'new_device' in kinds()


def test_changing_the_password_is_recorded(auth_client):
    user = UserFactory()
    client, response = sign_in(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.json()["data"]["token"]}')
    done = client.patch('/api/auth/change-password', {
        'currentPassword': 'Pass1234', 'newPassword': 'Brand-new-1234', 'confirmPassword': 'Brand-new-1234',
    }, format='json')
    assert done.status_code == 200
    assert 'password_changed' in kinds()
    assert 'Brand-new-1234' not in ' '.join(SecurityEvent.objects.values_list('detail', flat=True))


def test_asking_for_a_password_reset_is_recorded():
    user = UserFactory()
    APIClient().post('/api/auth/password-reset/request', {'email': user.email}, format='json')
    assert 'reset_requested' in kinds()


def test_signing_a_device_out_is_recorded():
    user = UserFactory()
    client, response = sign_in(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.json()["data"]["token"]}')
    other, _ = sign_in(user, FIREFOX)
    session = UserSession.objects.filter(user=user, user_agent=FIREFOX[:300]).first()
    assert client.delete(f'/api/auth/sessions/{session.pk}').status_code == 200
    assert 'session_revoked' in kinds()


def test_signing_out_all_other_devices_is_recorded():
    user = UserFactory()
    client, response = sign_in(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.json()["data"]["token"]}')
    sign_in(user, FIREFOX)
    client.post('/api/auth/sessions/revoke-others', {}, format='json')
    assert 'session_revoked' in kinds()


def test_a_copied_refresh_cookie_is_recorded():
    user = UserFactory()
    first, response = sign_in(user)
    old = response.cookies['ssms_refresh'].value
    assert first.post(REFRESH).status_code == 200
    thief = APIClient()
    thief.defaults['HTTP_USER_AGENT'] = FIREFOX
    thief.cookies['ssms_refresh'] = old
    assert thief.post(REFRESH).status_code == 401
    assert 'session_reused' in kinds()


def test_a_sign_in_that_sat_idle_is_recorded():
    from datetime import timedelta

    from django.utils import timezone
    admin = UserFactory(role='ADMIN')
    browser, _ = sign_in(admin)
    UserSession.objects.filter(user=admin).update(last_activity_at=timezone.now() - timedelta(minutes=16))
    browser.post(REFRESH)
    assert 'session_idle' in kinds()


def test_a_refusal_for_a_role_is_recorded_with_the_route_and_not_the_address_typed(auth_client):
    farmer = UserFactory(role='FARMER')
    assert auth_client(farmer).get('/api/admin/audit-log?search=secret-thing').status_code == 403
    assert 'permission_denied' in kinds()
    detail = last().detail
    assert 'api/admin/audit-log' in detail and 'GET' in detail
    assert 'secret-thing' not in detail


@pytest.mark.throttle
def test_a_slow_down_is_recorded():
    import core.throttles as throttles
    with mock.patch.object(throttles.LoginRateThrottle, 'rate', '1/minute', create=True):
        for _ in range(3):
            APIClient().post(LOGIN, {'email': 'a@example.rw', 'password': 'x'}, format='json')
    assert 'throttled' in kinds()
