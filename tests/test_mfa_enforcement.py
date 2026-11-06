"""An admin session that never passed a code is refused, and an admin can prove they still hold the phone.

The sign in already asks for a code. This is the second lock: no other path can give an admin a working session.
"""
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from core import lockout
from core.mfa_guard import require_recent_mfa
from logs.models import SecurityEvent
from tests.factories import UserFactory
from tests.mfa_helpers import PASSWORD, client_with, enable_factor, session_for, sign_in_admin, totp
from users.models import SecondFactor, UserSession

pytestmark = pytest.mark.django_db

ME = '/api/auth/me'
STEP_UP = '/api/auth/mfa/step-up'


# ── the second lock ─────────────────────────────────────────────────────────────────────────

def test_an_admin_token_with_no_session_is_refused_and_says_a_code_is_missing():
    response = client_with(UserFactory(role='ADMIN')).get(ME)
    assert response.status_code == 401
    assert response.json()['code'] == 'mfa_required'


def test_an_admin_session_that_never_passed_a_code_is_refused():
    user = UserFactory(role='ADMIN')
    response = client_with(user, session_for(user, verified_minutes_ago=None)).get(ME)
    assert response.status_code == 401 and response.json()['code'] == 'mfa_required'


def test_an_admin_session_that_passed_a_code_is_accepted():
    user = UserFactory(role='ADMIN')
    assert client_with(user, session_for(user, verified_minutes_ago=0)).get(ME).status_code == 200


def test_the_token_from_a_real_sign_in_works():
    user = UserFactory(role='ADMIN')
    client = APIClient()
    token = sign_in_admin(client, user).json()['data']['token']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    assert client.get(ME).status_code == 200


def test_an_old_session_is_still_accepted_because_the_code_was_checked_when_it_began():
    user = UserFactory(role='ADMIN')
    assert client_with(user, session_for(user, verified_minutes_ago=60 * 24)).get(ME).status_code == 200


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_a_farmer_or_supervisor_needs_no_code_with_or_without_a_session(role):
    user = UserFactory(role=role)
    assert client_with(user).get(ME).status_code == 200
    assert client_with(user, session_for(user)).get(ME).status_code == 200


def test_a_supervisor_made_an_admin_is_sent_back_through_the_sign_in():
    user = UserFactory(role='SUPERVISOR')
    client = client_with(user, session_for(user))
    assert client.get(ME).status_code == 200
    type(user).objects.filter(pk=user.pk).update(role='ADMIN')
    response = client.get(ME)
    assert response.status_code == 401 and response.json()['code'] == 'mfa_required'


def test_a_revoked_session_still_says_it_has_ended_not_that_a_code_is_missing():
    user = UserFactory(role='ADMIN')
    session = session_for(user, verified_minutes_ago=0)
    UserSession.objects.filter(pk=session.pk).update(revoked_at=timezone.now())
    response = client_with(user, session).get(ME)
    assert response.status_code == 401 and response.json().get('code') != 'mfa_required'


def test_the_check_costs_no_extra_query():
    user = UserFactory(role='ADMIN')
    client = client_with(user, session_for(user, verified_minutes_ago=0))
    client.get(ME)
    from django.db import connection
    from django.test.utils import CaptureQueriesContext
    with CaptureQueriesContext(connection) as captured:
        client.get(ME)
    lookups = [q for q in captured.captured_queries if 'user_sessions' in q['sql'] and q['sql'].lstrip().upper().startswith('SELECT')]
    assert len(lookups) == 1


# ── a recent code ───────────────────────────────────────────────────────────────────────────

def test_a_code_checked_a_minute_ago_is_recent_enough():
    user = UserFactory(role='ADMIN')
    request = SimpleNamespace(session_id=session_for(user, verified_minutes_ago=1).id)
    require_recent_mfa(request)


@pytest.mark.parametrize('minutes_ago', [11, 60, None])
def test_a_code_checked_long_ago_or_never_is_not(minutes_ago):
    user = UserFactory(role='ADMIN')
    request = SimpleNamespace(session_id=session_for(user, verified_minutes_ago=minutes_ago).id)
    with pytest.raises(PermissionDenied) as raised:
        require_recent_mfa(request)
    assert raised.value.detail.code == 'mfa_recent_required'


def test_the_window_can_be_asked_for_in_minutes():
    user = UserFactory(role='ADMIN')
    request = SimpleNamespace(session_id=session_for(user, verified_minutes_ago=3).id)
    require_recent_mfa(request, minutes=5)
    with pytest.raises(PermissionDenied):
        require_recent_mfa(request, minutes=2)


def test_no_session_at_all_is_not_recent():
    with pytest.raises(PermissionDenied):
        require_recent_mfa(SimpleNamespace(session_id=None))


def test_a_recent_code_refusal_reaches_the_page_with_its_code_and_is_not_logged_as_a_role_refusal(rf):
    from rest_framework.views import APIView

    from core.utils import custom_exception_handler
    exc = PermissionDenied('Please confirm with a code.', code='mfa_recent_required')
    response = custom_exception_handler(exc, {'request': rf.get('/x'), 'view': APIView()})
    assert response.status_code == 403 and response.data['code'] == 'mfa_recent_required'
    assert not SecurityEvent.objects.filter(kind='permission_denied').exists()


# ── step-up ─────────────────────────────────────────────────────────────────────────────────

def stepped(minutes_ago=30):
    user = UserFactory(role='ADMIN')
    secret = enable_factor(user)
    session = session_for(user, verified_minutes_ago=minutes_ago)
    return user, secret, session, client_with(user, session)


def test_a_right_code_makes_the_session_recent_again():
    user, secret, session, client = stepped(30)
    with pytest.raises(PermissionDenied):
        require_recent_mfa(SimpleNamespace(session_id=session.id))
    response = client.post(STEP_UP, {'code': totp(secret)}, format='json')
    assert response.status_code == 200
    require_recent_mfa(SimpleNamespace(session_id=session.id))


def test_a_wrong_code_changes_nothing_and_is_written_down():
    user, secret, session, client = stepped(30)
    before = UserSession.objects.get(pk=session.pk).mfa_verified_at
    wrong = '000000' if totp(secret) != '000000' else '111111'
    response = client.post(STEP_UP, {'code': wrong}, format='json')
    assert response.status_code == 422
    assert UserSession.objects.get(pk=session.pk).mfa_verified_at == before
    assert SecurityEvent.objects.filter(kind='mfa_failed', user_id=user.pk).exists()


def test_wrong_codes_at_step_up_count_toward_the_lockout():
    user, secret, session, client = stepped(30)
    answers = [client.post(STEP_UP, {'code': '000000'}, format='json').status_code for _ in range(5)]
    assert answers[:4] == [422] * 4 and answers[4] == 429
    assert lockout.is_locked(user.email) > 0
    assert client.post(STEP_UP, {'code': totp(secret)}, format='json').status_code == 429


def test_a_recovery_code_is_not_accepted_at_step_up_and_is_not_used_up():
    from users import mfa
    user, secret, session, client = stepped(30)
    code = mfa.new_recovery_codes(user)[0]
    assert client.post(STEP_UP, {'recovery_code': code}, format='json').status_code == 422
    assert client.post(STEP_UP, {'code': code}, format='json').status_code == 422
    assert mfa.recovery_codes_left(user) == 8


def test_a_code_cannot_be_used_twice_at_step_up():
    user, secret, session, client = stepped(30)
    code = totp(secret)
    assert client.post(STEP_UP, {'code': code}, format='json').status_code == 200
    assert client.post(STEP_UP, {'code': code}, format='json').status_code == 422


def test_step_up_only_changes_the_session_it_was_asked_on():
    user, secret, session, client = stepped(30)
    other = session_for(user, verified_minutes_ago=45)
    client.post(STEP_UP, {'code': totp(secret)}, format='json')
    assert UserSession.objects.get(pk=other.pk).mfa_verified_at < timezone.now() - timedelta(minutes=40)


def test_a_right_code_clears_the_failure_count():
    user, secret, session, client = stepped(30)
    for _ in range(3):
        client.post(STEP_UP, {'code': '000000'}, format='json')
    assert client.post(STEP_UP, {'code': totp(secret)}, format='json').status_code == 200
    assert lockout.is_locked(user.email) == 0


def test_step_up_without_the_app_set_up_is_refused_clearly():
    user = UserFactory(role='ADMIN')
    client = client_with(user, session_for(user, verified_minutes_ago=30))
    assert not SecondFactor.objects.filter(user=user).exists()
    assert client.post(STEP_UP, {'code': '123456'}, format='json').status_code == 400


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_an_admin_can_ask_for_step_up(role):
    user = UserFactory(role=role)
    assert client_with(user, session_for(user)).post(STEP_UP, {'code': '123456'}, format='json').status_code == 403


def test_a_stranger_is_told_to_sign_in():
    assert APIClient().post(STEP_UP, {'code': '123456'}, format='json').status_code == 401


# ── changing the password keeps the code on the session ─────────────────────────────────────

def test_an_admin_changing_the_password_stays_signed_in_with_the_code_still_on_record():
    user = UserFactory(role='ADMIN')
    session = session_for(user, verified_minutes_ago=2)
    client = client_with(user, session)
    before = UserSession.objects.get(pk=session.pk).mfa_verified_at
    response = client.patch('/api/auth/change-password', {
        'currentPassword': PASSWORD, 'newPassword': 'Valid-Passphrase-77', 'confirmPassword': 'Valid-Passphrase-77',
    }, format='json')
    assert response.status_code == 200
    assert UserSession.objects.get(pk=session.pk).mfa_verified_at == before
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.json()["data"]["token"]}')
    assert client.get(ME).status_code == 200


def test_an_admin_token_with_no_session_cannot_reach_change_password_to_get_a_new_session():
    user = UserFactory(role='ADMIN')
    response = client_with(user).patch('/api/auth/change-password', {
        'currentPassword': PASSWORD, 'newPassword': 'Valid-Passphrase-77', 'confirmPassword': 'Valid-Passphrase-77',
    }, format='json')
    assert response.status_code == 401
    assert not UserSession.objects.filter(user=user).exists()
