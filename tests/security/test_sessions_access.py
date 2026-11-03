from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework_simplejwt.tokens import AccessToken

from core.jwt_authentication import ActiveUserJWTAuthentication
from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
ME = '/api/auth/me'


def sign_in(user):
    client = APIClient()
    response = client.post(LOGIN, {'email': user.email, 'password': 'Pass1234'}, format='json')
    assert response.status_code == 200
    token = response.json()['data']['token']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client, token


def test_an_access_token_works_while_its_session_is_alive():
    client, _ = sign_in(UserFactory())
    assert client.get(ME).status_code == 200


def test_an_access_token_of_a_revoked_session_is_refused_at_once():
    user = UserFactory()
    client, _ = sign_in(user)
    UserSession.objects.filter(user=user).update(revoked_at=timezone.now(), revoked_reason='revoked')
    response = client.get(ME)
    assert response.status_code == 401


def test_an_access_token_of_an_expired_session_is_refused():
    user = UserFactory()
    client, _ = sign_in(user)
    UserSession.objects.filter(user=user).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert client.get(ME).status_code == 401


def test_an_access_token_whose_session_was_deleted_is_refused():
    user = UserFactory()
    client, _ = sign_in(user)
    UserSession.objects.filter(user=user).delete()
    assert client.get(ME).status_code == 401


def test_a_token_from_before_sessions_is_still_accepted(jwt_client):
    # It lives at most 15 minutes, so nobody is signed out on the day this ships.
    assert jwt_client(UserFactory()).get(ME).status_code == 200


def test_the_request_knows_which_session_it_belongs_to():
    user = UserFactory()
    _, token = sign_in(user)
    request = Request(APIRequestFactory().get(ME, HTTP_AUTHORIZATION=f'Bearer {token}'))
    ActiveUserJWTAuthentication().authenticate(request)
    assert request.session_id == UserSession.objects.get(user=user).id


def test_a_token_without_a_session_gives_no_session_id():
    user = UserFactory()
    request = Request(APIRequestFactory().get(ME, HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}'))
    ActiveUserJWTAuthentication().authenticate(request)
    assert request.session_id is None
