from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
SESSIONS = '/api/auth/sessions'
ME = '/api/auth/me'
WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'


def sign_in(user, agent=WINDOWS):
    client = APIClient()
    client.defaults['HTTP_USER_AGENT'] = agent
    response = client.post(LOGIN, {'email': user.email, 'password': 'Pass1234'}, format='json')
    assert response.status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['data']['token']}")
    return client


def rows(client):
    response = client.get(SESSIONS)
    assert response.status_code == 200, response.content
    return response.json()['data']


def test_the_list_needs_a_sign_in():
    assert APIClient().get(SESSIONS).status_code == 401


def test_the_list_shows_my_devices_and_marks_this_one():
    user = UserFactory()
    laptop = sign_in(user, WINDOWS)
    sign_in(user, IPHONE)
    sign_in(UserFactory(), WINDOWS)
    found = rows(laptop)
    assert sorted(r['deviceLabel'] for r in found) == ['Chrome on Windows', 'Safari on iPhone']
    assert [r['deviceLabel'] for r in found if r['isCurrent']] == ['Chrome on Windows']
    first = found[0]
    assert {'id', 'deviceLabel', 'customName', 'browser', 'os', 'isInstalledApp', 'ipAddress', 'createdAt', 'lastUsedAt', 'isCurrent'} <= set(first)
    assert 'userAgent' not in first and 'tokens' not in first


def test_ended_sessions_are_not_listed():
    user = UserFactory()
    client = sign_in(user)
    sign_in(user, IPHONE)
    UserSession.objects.filter(user=user, device_label='Safari on iPhone').update(revoked_at=timezone.now())
    assert [r['deviceLabel'] for r in rows(client)] == ['Chrome on Windows']


def test_the_list_is_capped_and_newest_first():
    user = UserFactory()
    client = sign_in(user)
    now = timezone.now()
    for n in range(60):
        UserSession.objects.create(
            user=user, device_label=f'Device {n}', last_used_at=now - timedelta(minutes=n + 1),
            last_activity_at=now, expires_at=now + timedelta(days=30),
        )
    found = rows(client)
    assert len(found) == 50
    stamps = [r['lastUsedAt'] for r in found]
    assert stamps == sorted(stamps, reverse=True)


def test_a_device_can_be_renamed_and_the_name_is_cleaned():
    user = UserFactory()
    client = sign_in(user)
    session = UserSession.objects.get(user=user)
    response = client.patch(f'{SESSIONS}/{session.id}', {'customName': '<b>My</b> work laptop ' + 'x' * 60}, format='json')
    assert response.status_code == 200, response.content
    session.refresh_from_db()
    assert session.custom_name.startswith('My work laptop x')
    assert len(session.custom_name) <= 40 and '<' not in session.custom_name


def test_a_name_can_be_cleared_and_must_be_text():
    user = UserFactory()
    client = sign_in(user)
    session = UserSession.objects.get(user=user)
    assert client.patch(f'{SESSIONS}/{session.id}', {'customName': 'Laptop'}, format='json').status_code == 200
    assert client.patch(f'{SESSIONS}/{session.id}', {'customName': ''}, format='json').status_code == 200
    assert UserSession.objects.get(pk=session.id).custom_name == ''
    assert client.patch(f'{SESSIONS}/{session.id}', {'customName': 7}, format='json').status_code == 422


def test_nobody_can_touch_another_persons_device():
    mine = sign_in(UserFactory())
    other = UserFactory()
    sign_in(other, IPHONE)
    theirs = UserSession.objects.get(user=other)
    assert mine.patch(f'{SESSIONS}/{theirs.id}', {'customName': 'x'}, format='json').status_code == 404
    assert mine.delete(f'{SESSIONS}/{theirs.id}').status_code == 404
    assert UserSession.objects.get(pk=theirs.id).revoked_at is None


def test_signing_out_another_device_stops_its_access_token_at_once():
    user = UserFactory()
    laptop = sign_in(user, WINDOWS)
    phone = sign_in(user, IPHONE)
    phone_session = UserSession.objects.get(user=user, device_label='Safari on iPhone')
    assert laptop.delete(f'{SESSIONS}/{phone_session.id}').status_code == 200
    assert phone.get(ME).status_code == 401
    assert phone.post('/api/auth/token/refresh').status_code == 401
    assert laptop.get(ME).status_code == 200


def test_signing_out_this_device_clears_its_cookie():
    user = UserFactory()
    client = sign_in(user)
    session = UserSession.objects.get(user=user)
    response = client.delete(f'{SESSIONS}/{session.id}')
    assert response.status_code == 200
    assert response.cookies['ssms_refresh'].value == ''
    assert client.get(ME).status_code == 401


def test_sign_out_all_other_devices_keeps_this_one():
    user = UserFactory()
    laptop = sign_in(user, WINDOWS)
    phone = sign_in(user, IPHONE)
    sign_in(user, IPHONE)
    response = laptop.post(f'{SESSIONS}/revoke-others')
    assert response.status_code == 200
    assert response.json()['data']['revoked'] == 2
    assert laptop.get(ME).status_code == 200
    assert phone.get(ME).status_code == 401
    assert [r['deviceLabel'] for r in rows(laptop)] == ['Chrome on Windows']


def test_every_sign_out_of_a_device_is_in_the_audit_log():
    user = UserFactory()
    laptop = sign_in(user, WINDOWS)
    sign_in(user, IPHONE)
    phone = UserSession.objects.get(user=user, device_label='Safari on iPhone')
    laptop.delete(f'{SESSIONS}/{phone.id}')
    entry = AuditLog.objects.filter(user=user, action='LOGOUT').latest('created_at')
    assert 'Safari on iPhone' in entry.detail


def test_old_ended_sessions_are_pruned_and_live_ones_kept():
    user = UserFactory()
    now = timezone.now()
    def make(label, **extra):
        return UserSession.objects.create(
            user=user, device_label=label, last_used_at=now, last_activity_at=now, expires_at=now + timedelta(days=30), **extra,
        )
    make('live')
    make('ended a day ago', revoked_at=now - timedelta(days=1))
    make('ended long ago', revoked_at=now - timedelta(days=40))
    old = make('ran out long ago')
    UserSession.objects.filter(pk=old.pk).update(expires_at=now - timedelta(days=40))
    out = StringIO()
    call_command('prune_sessions', '--days', '30', stdout=out)
    assert sorted(UserSession.objects.values_list('device_label', flat=True)) == ['ended a day ago', 'live']
    assert '2' in out.getvalue()
