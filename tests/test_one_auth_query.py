"""Every request is checked before the view runs. That check costs one round trip to the database, not two.

The token names the person and the sign in (the session). Both come back in one joined query. A round trip to a
database in another country is the biggest part of a short request, so each one saved is felt on every page.
"""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from rest_framework_simplejwt.tokens import AccessToken

from core.jwt_authentication import ActiveUserJWTAuthentication
from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db


def sign_in(user, **session_fields):
    now = timezone.now()
    session = UserSession.objects.create(
        user=user, last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now), mfa_verified_at=now,
        **session_fields,
    )
    token = AccessToken.for_user(user)
    token['sid'] = session.id
    return str(token), session


def check(token):
    request = APIRequestFactory().get('/api/auth/me', HTTP_AUTHORIZATION=f'Bearer {token}')
    return ActiveUserJWTAuthentication().authenticate(Request(request))


def test_a_signed_in_device_is_checked_with_one_query():
    token, _ = sign_in(UserFactory(role='FARMER'))
    with CaptureQueriesContext(connection) as captured:
        user, _ = check(token)
    assert len(captured) == 1, [q['sql'] for q in captured]
    assert user.role == 'FARMER'


def test_the_one_query_gives_back_the_right_person():
    farmer = UserFactory(role='FARMER')
    UserFactory(role='FARMER')
    token, _ = sign_in(farmer)
    user, _ = check(token)
    assert user.pk == farmer.pk


def test_an_ended_session_is_still_refused_by_name():
    token, session = sign_in(UserFactory(role='FARMER'))
    session.revoked_at = timezone.now()
    session.save(update_fields=['revoked_at'])
    with pytest.raises(AuthenticationFailed) as refused:
        check(token)
    assert str(refused.value.detail['code']) == 'session_revoked'


def test_a_session_that_no_longer_exists_is_refused_by_name():
    token, session = sign_in(UserFactory(role='FARMER'))
    session.delete()
    with pytest.raises(AuthenticationFailed) as refused:
        check(token)
    assert str(refused.value.detail['code']) == 'session_revoked'


def test_a_deactivated_person_is_refused_even_with_a_live_session():
    person = UserFactory(role='FARMER')
    token, _ = sign_in(person)
    person.is_active = False
    person.save(update_fields=['is_active'])
    with pytest.raises(AuthenticationFailed) as refused:
        check(token)
    assert str(refused.value.detail['code']) == 'user_inactive'


def test_a_token_made_before_sessions_existed_still_works_with_the_old_lookup():
    farmer = UserFactory(role='FARMER')
    user, _ = check(str(AccessToken.for_user(farmer)))
    assert user.pk == farmer.pk
