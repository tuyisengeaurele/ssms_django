"""What a page does by itself, checking for a support request, announcements and messages, must not keep a sign in alive.

Using the site moves the idle clock. The check is made by the page, not by the person, so counting it would mean a tab
left open on a shared computer never signs out. The idle limit must still apply to it, so it cannot revive a stale sign in.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from tests.factories import UserFactory
from tests.mfa_helpers import client_with, session_for
from tests.test_messaging_access import world  # noqa: F401 (a fixture)
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


# ── messages ─────────────────────────────────────────────────────────────────────────────────

def signed_in_idle_for(user, minutes):
    session = session_for(user)
    before = timezone.now() - timedelta(minutes=minutes)
    UserSession.objects.filter(pk=session.pk).update(last_activity_at=before)
    return client_with(user, session), session, before


# A screen nobody is at keeps asking, and may mark what arrives. Neither may keep the sign in alive.
@pytest.mark.parametrize('call', ['updates', 'read'])
def test_what_the_messages_page_does_by_itself_does_not_move_the_idle_clock_or_revive_a_sign_in(world, call):  # noqa: F811
    def do(browser):
        if call == 'updates':
            return browser.get('/api/messages/updates', {'conversation': world.talk.pk, 'since': world.said.created_at.isoformat()})
        return browser.post('/api/messages/read', {'conversation_id': world.talk.pk, 'message_id': world.answer.pk}, format='json')

    browser, session, before = signed_in_idle_for(world.supervisor, 10)
    assert do(browser).status_code == 200
    assert last_activity(session) == before

    browser, _, _ = signed_in_idle_for(world.supervisor, 45)
    response = do(browser)
    assert response.status_code == 401 and response.json()['code'] == 'session_idle'


def test_sending_a_message_is_something_the_person_did(world):  # noqa: F811
    browser, session, before = signed_in_idle_for(world.supervisor, 10)
    body = {'conversation_id': world.talk.pk, 'body': 'Hello.', 'client_id': 'idle-clock-1'}
    assert browser.post('/api/messages/send', body, format='json').status_code == 201
    assert last_activity(session) > before
