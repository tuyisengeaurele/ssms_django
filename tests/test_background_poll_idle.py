"""The page's 30 second check for a support request must not keep a sign in alive.

Using the site moves the idle clock. The check is made by the page, not by the person, so counting it would mean a tab
left open on a shared computer never signs out. The idle limit must still apply to it, so it cannot revive a stale sign in.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from tests.factories import UserFactory
from tests.test_one_auth_query import sign_in
from users.models import UserSession

pytestmark = pytest.mark.django_db

PENDING = '/api/support-access/for-me/pending'


def client_for(token):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


def last_activity(session):
    return UserSession.objects.get(pk=session.pk).last_activity_at


def test_the_check_for_a_support_request_does_not_move_the_idle_clock():
    token, session = sign_in(UserFactory(role='SUPERVISOR'))
    before = timezone.now() - timedelta(minutes=10)
    UserSession.objects.filter(pk=session.pk).update(last_activity_at=before)

    assert client_for(token).get(PENDING).status_code == 200
    assert last_activity(session) == before


def test_an_ordinary_request_still_moves_the_idle_clock():
    token, session = sign_in(UserFactory(role='SUPERVISOR'))
    before = timezone.now() - timedelta(minutes=10)
    UserSession.objects.filter(pk=session.pk).update(last_activity_at=before)

    assert client_for(token).get('/api/auth/me').status_code == 200
    assert last_activity(session) > before


def test_the_check_cannot_revive_a_sign_in_that_sat_idle_too_long():
    token, session = sign_in(UserFactory(role='SUPERVISOR'))
    UserSession.objects.filter(pk=session.pk).update(last_activity_at=timezone.now() - timedelta(minutes=45))

    response = client_for(token).get(PENDING)
    assert response.status_code == 401 and response.json()['code'] == 'session_idle'
