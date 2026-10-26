import re
from datetime import datetime, timedelta
from unittest import mock

import pytest
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from tests.factories import UserFactory
from users.tokens import email_verification_token

pytestmark = pytest.mark.django_db

VERIFY = '/api/auth/verify-email'


def link_for(user):
    return {'uid': urlsafe_base64_encode(force_bytes(user.pk)), 'token': email_verification_token.make_token(user)}


def assert_no_session(response):
    assert 'token' not in (response.json().get('data') or {})
    assert 'ssms_refresh' not in response.cookies


def test_a_verified_user_with_a_garbage_token_gets_no_session(api_client):
    user = UserFactory(is_email_verified=True)
    response = api_client.post(VERIFY, {'uid': link_for(user)['uid'], 'token': 'x'}, format='json')
    assert_no_session(response)


def test_a_valid_link_verifies_the_account_without_signing_in(api_client):
    user = UserFactory(is_email_verified=False)
    response = api_client.post(VERIFY, link_for(user), format='json')
    assert response.status_code == 200
    assert_no_session(response)
    user.refresh_from_db()
    assert user.is_email_verified is True


def test_a_link_works_only_once(api_client):
    user = UserFactory(is_email_verified=False)
    link = link_for(user)
    assert api_client.post(VERIFY, link, format='json').status_code == 200
    second = api_client.post(VERIFY, link, format='json')
    assert second.status_code == 200
    assert 'already' in second.json()['message'].lower()
    assert_no_session(second)


def test_a_wrong_token_does_not_verify_an_unverified_account(api_client):
    user = UserFactory(is_email_verified=False)
    response = api_client.post(VERIFY, {'uid': link_for(user)['uid'], 'token': 'not-a-token'}, format='json')
    assert response.status_code == 400
    user.refresh_from_db()
    assert user.is_email_verified is False


def test_a_password_reset_token_cannot_verify_an_email(api_client):
    user = UserFactory(is_email_verified=False)
    response = api_client.post(
        VERIFY,
        {'uid': link_for(user)['uid'], 'token': default_token_generator.make_token(user)},
        format='json',
    )
    assert response.status_code == 400
    user.refresh_from_db()
    assert user.is_email_verified is False


def test_an_unknown_account_is_a_400(api_client):
    uid = urlsafe_base64_encode(force_bytes('no-such-user'))
    assert api_client.post(VERIFY, {'uid': uid, 'token': 'x'}, format='json').status_code == 400


def test_a_turned_off_account_cannot_verify(api_client):
    user = UserFactory(is_email_verified=False, is_active=False)
    assert api_client.post(VERIFY, link_for(user), format='json').status_code == 400


def test_an_expired_link_is_a_400(api_client):
    user = UserFactory(is_email_verified=False)
    link = link_for(user)
    with mock.patch.object(email_verification_token, '_now', return_value=datetime.now() + timedelta(hours=2)):
        response = api_client.post(VERIFY, link, format='json')
    assert response.status_code == 400
    user.refresh_from_db()
    assert user.is_email_verified is False


def test_an_incomplete_link_is_a_422(api_client):
    assert api_client.post(VERIFY, {'uid': 'abc'}, format='json').status_code == 422


def test_the_emailed_link_works_from_registration_to_verification(api_client):
    api_client.post('/api/auth/register', {'name': 'Aline', 'email': 'aline@example.rw', 'password': 'Zebra-Quartz-84'}, format='json')
    body = mail.outbox[0].body
    uid, token = re.search(r'uid=([^&\s]+)&token=([^\s]+)', body).groups()
    response = api_client.post(VERIFY, {'uid': uid, 'token': token}, format='json')
    assert response.status_code == 200
    assert_no_session(response)
    login = api_client.post('/api/auth/login', {'email': 'aline@example.rw', 'password': 'Zebra-Quartz-84'}, format='json')
    assert login.status_code == 200
