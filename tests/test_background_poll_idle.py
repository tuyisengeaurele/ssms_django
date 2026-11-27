"""The checks a page makes by itself, for a support request and for announcements, must not keep a sign in alive.

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
BY_ITSELF = [PENDING, '/api/announcements']


def client_for(token):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


def last_activity(session):
    return UserSession.objects.get(pk=session.pk).last_activity_at


@pytest.mark.parametrize('path', BY_ITSELF)
def test_a_check_the_page_makes_by_itself_does_not_move_the_idle_clock(path):
    token, session = sign_in(UserFactory(role='SUPERVISOR'))
    before = timezone.now() - timedelta(minutes=10)
    UserSession.objects.filter(pk=session.pk).update(last_activity_at=before)

    assert client_for(token).get(path).status_code == 200
    assert last_activity(session) == before


def test_an_ordinary_request_still_moves_the_idle_clock():
    token, session = sign_in(UserFactory(role='SUPERVISOR'))
    before = timezone.now() - timedelta(minutes=10)
    UserSession.objects.filter(pk=session.pk).update(last_activity_at=before)

    assert client_for(token).get('/api/auth/me').status_code == 200
    assert last_activity(session) > before


@pytest.mark.parametrize('path', BY_ITSELF)
def test_such_a_check_cannot_revive_a_sign_in_that_sat_idle_too_long(path):
    token, session = sign_in(UserFactory(role='SUPERVISOR'))
    UserSession.objects.filter(pk=session.pk).update(last_activity_at=timezone.now() - timedelta(minutes=45))

    response = client_for(token).get(path)
    assert response.status_code == 401 and response.json()['code'] == 'session_idle'
