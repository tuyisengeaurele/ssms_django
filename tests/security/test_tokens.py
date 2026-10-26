from datetime import timedelta

import pytest
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken

from core.tokens import revoke_all_refresh_tokens
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
REFRESH = '/api/auth/token/refresh'
STRONG = 'Zebra-Quartz-84'


def sign_in(user, password='Pass1234'):
    """A fresh browser: its own cookie jar, signed in as the user."""
    client = APIClient()
    response = client.post(LOGIN, {'email': user.email, 'password': password}, format='json')
    assert response.status_code == 200, response.content
    return client, response


def test_access_token_lives_15_minutes():
    _, response = sign_in(UserFactory())
    token = AccessToken(response.json()['data']['token'])
    assert token['exp'] - token['iat'] == 15 * 60


def test_refresh_cookie_lasts_7_days():
    _, response = sign_in(UserFactory())
    assert response.cookies['ssms_refresh']['max-age'] == 7 * 24 * 3600


def test_the_refresh_token_is_good_for_7_days_in_the_database():
    user = UserFactory()
    sign_in(user)
    outstanding = OutstandingToken.objects.get(user=user)
    lifetime = outstanding.expires_at - outstanding.created_at
    assert abs(lifetime - timedelta(days=7)) < timedelta(seconds=2)


def test_refresh_gives_a_new_access_token_and_rotates_the_cookie():
    client, login = sign_in(UserFactory())
    old = login.cookies['ssms_refresh'].value
    response = client.post(REFRESH)
    assert response.status_code == 200
    assert response.json()['access']
    assert response.cookies['ssms_refresh'].value != old


def test_a_used_refresh_token_cannot_be_replayed():
    client, login = sign_in(UserFactory())
    old = login.cookies['ssms_refresh'].value
    assert client.post(REFRESH).status_code == 200
    thief = APIClient()
    thief.cookies['ssms_refresh'] = old
    assert thief.post(REFRESH).status_code == 401


def test_refresh_fails_for_a_deactivated_user():
    user = UserFactory()
    client, _ = sign_in(user)
    user.is_active = False
    user.save(update_fields=['is_active'])
    assert client.post(REFRESH).status_code == 401


def test_changing_the_password_signs_other_devices_out_but_keeps_this_one_in():
    user = UserFactory()
    phone, _ = sign_in(user)
    laptop, _ = sign_in(user)
    response = laptop.patch(
        '/api/auth/change-password',
        {'currentPassword': 'Pass1234', 'newPassword': STRONG, 'confirmPassword': STRONG},
        format='json',
        HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}',
    )
    assert response.status_code == 200, response.content
    assert response.json()['data']['token']
    assert 'ssms_refresh' in response.cookies
    assert phone.post(REFRESH).status_code == 401
    assert laptop.post(REFRESH).status_code == 200


def test_resetting_the_password_signs_every_device_out():
    user = UserFactory()
    phone, _ = sign_in(user)
    response = APIClient().post(
        '/api/auth/password-reset/confirm',
        {
            'uid': urlsafe_base64_encode(force_bytes(user.pk)),
            'token': default_token_generator.make_token(user),
            'newPassword': STRONG,
        },
        format='json',
    )
    assert response.status_code == 200, response.content
    assert phone.post(REFRESH).status_code == 401


def test_turning_a_user_off_signs_them_out_everywhere():
    victim = UserFactory()
    phone, _ = sign_in(victim)
    admin = UserFactory(role='ADMIN')
    admin_client = APIClient()
    admin_client.force_authenticate(admin)
    assert admin_client.delete(f'/api/admin/users/{victim.pk}').status_code == 200
    assert phone.post(REFRESH).status_code == 401


def test_revoke_all_refresh_tokens_counts_and_is_repeatable():
    user = UserFactory()
    sign_in(user)
    sign_in(user)
    other = UserFactory()
    sign_in(other)

    assert revoke_all_refresh_tokens(user) == 2
    assert BlacklistedToken.objects.filter(token__user=user).count() == 2
    assert BlacklistedToken.objects.filter(token__user=other).count() == 0
    assert revoke_all_refresh_tokens(user) == 0
