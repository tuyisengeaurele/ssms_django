from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
REFRESH = '/api/auth/token/refresh'
CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
OTHER_BROWSER = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'


def browser(agent=CHROME_WINDOWS):
    client = APIClient()
    client.defaults['HTTP_USER_AGENT'] = agent
    return client


def sign_in(user, agent=CHROME_WINDOWS):
    client = browser(agent)
    response = client.post(LOGIN, {'email': user.email, 'password': 'Pass1234'}, format='json')
    assert response.status_code == 200, response.content
    return client, response.cookies['ssms_refresh'].value


def with_cookie(cookie, agent=CHROME_WINDOWS):
    client = browser(agent)
    client.cookies['ssms_refresh'] = cookie
    return client


class Clock:
    """Moves the session clock without waiting."""
    def __init__(self):
        self.now = timezone.now()

    def move(self, **delta):
        self.now += timedelta(**delta)

    def __enter__(self):
        self._patch = mock.patch('users.sessions._now', side_effect=lambda: self.now)
        self._patch.start()
        return self

    def __exit__(self, *exc):
        self._patch.stop()


@pytest.fixture
def clock():
    with Clock() as c:
        yield c


def test_refresh_gives_a_new_cookie_and_the_session_follows(clock):
    user = UserFactory()
    client, first = sign_in(user)
    clock.move(minutes=15)
    response = client.post(REFRESH)
    assert response.status_code == 200 and response.json()['access']
    second = response.cookies['ssms_refresh'].value
    assert second != first
    assert RefreshToken(second)['sid'] == UserSession.objects.get(user=user).id
    session = UserSession.objects.get(user=user)
    assert session.last_used_at == clock.now


def test_a_lost_response_can_be_asked_again_from_the_same_browser(clock):
    # The phone asked for a new cookie, the answer never arrived, and it asks again with the old cookie.
    user = UserFactory()
    client, first = sign_in(user)
    assert client.post(REFRESH).status_code == 200
    clock.move(seconds=10)
    retry = with_cookie(first)
    assert retry.post(REFRESH).status_code == 200


def test_two_tabs_asking_together_are_both_answered_and_either_new_cookie_works_later(clock):
    user = UserFactory()
    _, first = sign_in(user)
    one = with_cookie(first).post(REFRESH)
    two = with_cookie(first).post(REFRESH)
    assert one.status_code == two.status_code == 200
    clock.move(minutes=15)
    for answer in (one, two):
        assert with_cookie(answer.cookies['ssms_refresh'].value).post(REFRESH).status_code == 200


def test_the_old_cookie_is_refused_after_the_grace_window_and_the_session_ends(clock):
    user = UserFactory()
    client, first = sign_in(user)
    newest = client.post(REFRESH).cookies['ssms_refresh'].value
    clock.move(seconds=31)
    assert with_cookie(first).post(REFRESH).status_code == 401
    session = UserSession.objects.get(user=user)
    assert session.revoked_at is not None and session.revoked_reason == 'reused'
    assert with_cookie(newest).post(REFRESH).status_code == 401


def test_a_used_cookie_from_another_browser_is_refused_at_once(clock):
    user = UserFactory()
    client, first = sign_in(user)
    client.post(REFRESH)
    thief = with_cookie(first, OTHER_BROWSER)
    assert thief.post(REFRESH).status_code == 401
    assert UserSession.objects.get(user=user).revoked_at is not None


def test_a_cookie_that_was_never_issued_is_refused():
    user = UserFactory()
    sign_in(user)
    stranger = RefreshToken.for_user(user)
    stranger['sid'] = UserSession.objects.get(user=user).id
    assert with_cookie(str(stranger)).post(REFRESH).status_code == 401


def test_the_session_ends_after_30_days_even_if_it_keeps_being_renewed(clock):
    user = UserFactory()
    client, _ = sign_in(user)
    for _ in range(29):
        clock.move(days=1)
        response = client.post(REFRESH)
        assert response.status_code == 200
        client.cookies['ssms_refresh'] = response.cookies['ssms_refresh'].value
    clock.move(days=2)
    assert client.post(REFRESH).status_code == 401


def test_a_revoked_session_cannot_renew(clock):
    user = UserFactory()
    client, _ = sign_in(user)
    UserSession.objects.filter(user=user).update(revoked_at=clock.now, revoked_reason='logout')
    assert client.post(REFRESH).status_code == 401


def test_a_token_from_before_sessions_works_and_gets_a_session(clock):
    user = UserFactory()
    legacy = RefreshToken.for_user(user)
    assert 'sid' not in legacy.payload
    client = with_cookie(str(legacy))
    response = client.post(REFRESH)
    assert response.status_code == 200
    new = response.cookies['ssms_refresh'].value
    session = UserSession.objects.get(user=user)
    assert RefreshToken(new)['sid'] == session.id
    assert client.post(REFRESH).status_code == 200


def test_a_deactivated_user_cannot_refresh():
    user = UserFactory()
    client, _ = sign_in(user)
    user.is_active = False
    user.save(update_fields=['is_active'])
    assert client.post(REFRESH).status_code == 401


def test_only_the_last_few_tokens_are_remembered(clock):
    user = UserFactory()
    client, _ = sign_in(user)
    for _ in range(12):
        clock.move(minutes=1)
        response = client.post(REFRESH)
        client.cookies['ssms_refresh'] = response.cookies['ssms_refresh'].value
    assert len(UserSession.objects.get(user=user).tokens) <= 5
