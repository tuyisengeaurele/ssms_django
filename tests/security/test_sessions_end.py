import pytest
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from core.tokens import revoke_all_refresh_tokens
from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
LOGOUT = '/api/auth/logout'
REFRESH = '/api/auth/token/refresh'
ME = '/api/auth/me'
STRONG = 'Zebra-Quartz-84'


def sign_in(user, agent='browser-one'):
    client = APIClient()
    client.defaults['HTTP_USER_AGENT'] = agent
    response = client.post(LOGIN, {'email': user.email, 'password': 'Pass1234'}, format='json')
    assert response.status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['data']['token']}")
    return client


def test_logging_out_ends_the_session_and_its_access_token():
    user = UserFactory()
    client = sign_in(user)
    assert client.post(LOGOUT).status_code == 200
    session = UserSession.objects.get(user=user)
    assert session.revoked_at is not None and session.revoked_reason == 'logout'
    assert client.get(ME).status_code == 401
    assert client.post(REFRESH).status_code == 401


def test_logging_out_leaves_the_other_devices_alone():
    user = UserFactory()
    phone = sign_in(user, 'phone')
    laptop = sign_in(user, 'laptop')
    phone.post(LOGOUT)
    assert laptop.get(ME).status_code == 200
    assert laptop.post(REFRESH).status_code == 200


def test_changing_the_password_ends_the_other_sessions_and_keeps_this_one():
    user = UserFactory()
    phone = sign_in(user, 'phone')
    laptop = sign_in(user, 'laptop')
    laptop_session = UserSession.objects.get(user=user, user_agent='laptop')
    response = laptop.patch(
        '/api/auth/change-password',
        {'currentPassword': 'Pass1234', 'newPassword': STRONG, 'confirmPassword': STRONG}, format='json',
    )
    assert response.status_code == 200, response.content
    assert phone.get(ME).status_code == 401
    assert UserSession.objects.get(user=user, user_agent='phone').revoked_reason == 'password'
    # The laptop keeps its own session, with a cookie that works.
    laptop.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['data']['token']}")
    assert laptop.get(ME).status_code == 200
    assert laptop.post(REFRESH).status_code == 200
    assert UserSession.objects.filter(user=user, revoked_at__isnull=True).get().id == laptop_session.id


def test_changing_the_password_from_an_older_token_still_signs_the_other_devices_out():
    user = UserFactory()
    phone = sign_in(user, 'phone')
    client = APIClient()
    response = client.patch(
        '/api/auth/change-password',
        {'currentPassword': 'Pass1234', 'newPassword': STRONG, 'confirmPassword': STRONG}, format='json',
        HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}',
    )
    assert response.status_code == 200
    assert phone.get(ME).status_code == 401
    assert client.post(REFRESH).status_code == 200


def test_resetting_the_password_ends_every_session():
    user = UserFactory()
    phone = sign_in(user)
    response = APIClient().post('/api/auth/password-reset/confirm', {
        'uid': urlsafe_base64_encode(force_bytes(user.pk)),
        'token': default_token_generator.make_token(user),
        'newPassword': STRONG,
    }, format='json')
    assert response.status_code == 200, response.content
    assert phone.get(ME).status_code == 401
    assert not UserSession.objects.filter(user=user, revoked_at__isnull=True).exists()


def test_signing_out_everywhere_also_ends_a_device_that_has_renewed_its_cookie():
    # The cookie a device holds after a renewal is not the one it signed in with, and it must end too.
    user = UserFactory()
    client = sign_in(user)
    assert client.post(REFRESH).status_code == 200
    revoke_all_refresh_tokens(user)
    assert client.post(REFRESH).status_code == 401
    assert client.get(ME).status_code == 401


def test_signing_out_everywhere_marks_every_live_session():
    user = UserFactory()
    sign_in(user, 'one')
    sign_in(user, 'two')
    other = UserFactory()
    sign_in(other)
    revoke_all_refresh_tokens(user)
    assert UserSession.objects.filter(user=user, revoked_reason='signed_out_all').count() == 2
    assert UserSession.objects.filter(user=other, revoked_at__isnull=True).count() == 1
