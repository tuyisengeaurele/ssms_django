from datetime import timedelta
from unittest import mock

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from core.mail import send_email
from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'


def browser(agent):
    client = APIClient()
    client.defaults['HTTP_USER_AGENT'] = agent
    return client


def sign_in(user, agent=CHROME_WINDOWS, **body):
    client = browser(agent)
    response = client.post(LOGIN, {'email': user.email, 'password': 'Pass1234', **body}, format='json')
    assert response.status_code == 200, response.content
    return client, response


@pytest.fixture(autouse=True)
def mail_now():
    """The notice goes out on a thread in real life. Here it is sent on the spot so the test can read it."""
    with mock.patch('users.sessions.send_email_async', side_effect=lambda *a, **k: send_email(*a, **k)):
        yield


def test_login_creates_one_session_with_the_device_and_address():
    user = UserFactory()
    sign_in(user)
    session = UserSession.objects.get(user=user)
    assert session.device_label == 'Chrome on Windows'
    assert (session.browser, session.os, session.is_installed_app) == ('Chrome', 'Windows', False)
    assert session.user_agent == CHROME_WINDOWS
    assert abs(session.expires_at - (timezone.now() + timedelta(days=30))) < timedelta(minutes=1)
    assert session.revoked_at is None


def test_two_logins_make_two_sessions_and_both_keep_working():
    user = UserFactory()
    phone, _ = sign_in(user, CHROME_ANDROID)
    laptop, _ = sign_in(user, CHROME_WINDOWS)
    assert UserSession.objects.filter(user=user).count() == 2
    assert phone.post('/api/auth/token/refresh').status_code == 200
    assert laptop.post('/api/auth/token/refresh').status_code == 200


def test_both_tokens_carry_the_session_id():
    user = UserFactory()
    _, response = sign_in(user)
    session = UserSession.objects.get(user=user)
    assert RefreshToken(response.cookies['ssms_refresh'].value)['sid'] == session.id
    assert AccessToken(response.json()['data']['token'])['sid'] == session.id


def test_the_cookie_token_is_the_one_the_session_remembers():
    user = UserFactory()
    _, response = sign_in(user)
    session = UserSession.objects.get(user=user)
    assert [t['jti'] for t in session.tokens] == [RefreshToken(response.cookies['ssms_refresh'].value)['jti']]
    assert session.tokens[0]['used_at'] is None


def test_hints_from_the_browser_name_the_phone():
    user = UserFactory()
    sign_in(user, CHROME_ANDROID, device={'model': 'Pixel 9', 'installed': False})
    assert UserSession.objects.get(user=user).device_label == 'Chrome on Pixel 9'


def test_a_login_without_hints_still_works():
    user = UserFactory()
    sign_in(user, CHROME_ANDROID)
    assert UserSession.objects.get(user=user).device_label == 'Chrome on Android'


@pytest.mark.parametrize('junk', ['x', 7, ['a'], {'model': {'a': 1}}, None])
def test_junk_in_the_device_field_does_not_break_sign_in(junk):
    user = UserFactory()
    sign_in(user, CHROME_WINDOWS, device=junk)
    assert UserSession.objects.filter(user=user).count() == 1


def test_the_first_ever_sign_in_sends_no_notice():
    sign_in(UserFactory())
    assert mail.outbox == []


def test_a_new_device_gets_one_notice_and_a_known_one_none():
    user = UserFactory()
    sign_in(user, CHROME_WINDOWS)
    sign_in(user, SAFARI_IPHONE)
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == [user.email]
    assert 'Safari on iPhone' in message.body
    assert '127.0.0.1' not in message.body
    assert 'localhost:5173/settings/security' in message.body
    sign_in(user, SAFARI_IPHONE)
    sign_in(user, CHROME_WINDOWS)
    assert len(mail.outbox) == 1


def test_a_mail_problem_does_not_stop_the_sign_in():
    user = UserFactory()
    sign_in(user, CHROME_WINDOWS)
    with mock.patch('users.sessions.send_email_async', side_effect=OSError('smtp down')):
        sign_in(user, SAFARI_IPHONE)
    assert UserSession.objects.filter(user=user).count() == 2
