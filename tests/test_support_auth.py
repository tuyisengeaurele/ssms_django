"""A support token acts as the person, and stops the moment anything that allowed it stops.

Authority comes from the database rows, never from the token's own claims, so each way to lose it is tested.
"""
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework_simplejwt.tokens import AccessToken

from core.jwt_authentication import ActiveUserJWTAuthentication
from support_access import services
from support_access.models import SupportAccess
from tests.factories import UserFactory
from tests.support_helpers import acting, admin_and_person, age
from tests.test_one_auth_query import sign_in
from users.models import User, UserSession

pytestmark = pytest.mark.django_db

ME = '/api/auth/me'


def client_for(token):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


def check(token):
    request = APIRequestFactory().get(ME, HTTP_AUTHORIZATION=f'Bearer {token}')
    return ActiveUserJWTAuthentication().authenticate(Request(request))


def ended(response):
    assert response.status_code == 401, response.content
    assert response.json()['code'] == 'support_ended'
    assert response.json()['message'] == 'The support session has ended.'


# ── acting as the person ──────────────────────────────────────────────────────

def test_the_token_acts_as_the_person():
    admin, person = admin_and_person()
    token, _ = acting(admin, person)
    body = client_for(token).get(ME).json()
    assert body['data']['id'] == person.pk and body['data']['role'] == 'FARMER'


def test_a_support_request_costs_one_authentication_query():
    admin, person = admin_and_person()
    token, _ = acting(admin, person)
    with CaptureQueriesContext(connection) as captured:
        user, _ = check(token)
    assert len(captured) == 1, [q['sql'] for q in captured]
    assert user.pk == person.pk


def test_the_request_knows_the_real_admin_and_the_visit():
    admin, person = admin_and_person()
    token, access = acting(admin, person)
    request = Request(APIRequestFactory().get(ME, HTTP_AUTHORIZATION=f'Bearer {token}'))
    ActiveUserJWTAuthentication().authenticate(request)
    assert request.acting_admin.pk == admin.pk and request.support.pk == access.pk
    assert request._request.support_access_id == access.pk


def test_an_ordinary_request_has_no_acting_admin():
    person = UserFactory()
    token, _ = sign_in(person)
    request = Request(APIRequestFactory().get(ME, HTTP_AUTHORIZATION=f'Bearer {token}'))
    ActiveUserJWTAuthentication().authenticate(request)
    assert getattr(request, 'acting_admin', None) is None and not hasattr(request._request, 'support_access_id')


# ── everything that must end it ───────────────────────────────────────────────

def _revoke_session(admin, person, access):
    UserSession.objects.filter(support_access_id=access.pk).update(revoked_at=timezone.now())


def _person_ends(admin, person, access):
    services.end_support_access(access, 'person', 'person_ended')


def _time_passes(admin, person, access):
    age(access, minutes=31)


def _admin_deactivated(admin, person, access):
    User.objects.filter(pk=admin.pk).update(is_active=False)


def _admin_demoted(admin, person, access):
    User.objects.filter(pk=admin.pk).update(role='FARMER')


def _admin_signs_out(admin, person, access):
    UserSession.objects.filter(pk=access.admin_session_id).update(revoked_at=timezone.now())


def _admin_session_expires(admin, person, access):
    UserSession.objects.filter(pk=access.admin_session_id).update(expires_at=timezone.now() - timedelta(seconds=1))


def _person_deactivated(admin, person, access):
    User.objects.filter(pk=person.pk).update(is_active=False)


def _person_becomes_admin(admin, person, access):
    User.objects.filter(pk=person.pk).update(role='ADMIN')


@pytest.mark.parametrize('stop', [
    _revoke_session, _person_ends, _time_passes, _admin_deactivated, _admin_demoted,
    _admin_signs_out, _admin_session_expires, _person_deactivated, _person_becomes_admin,
])
def test_each_of_these_ends_the_visit_on_the_next_request(stop):
    admin, person = admin_and_person()
    token, access = acting(admin, person)
    assert client_for(token).get(ME).status_code == 200
    stop(admin, person, access)
    ended(client_for(token).get(ME))
    access.refresh_from_db()
    assert access.status == SupportAccess.Status.ENDED


def test_a_request_at_the_exact_end_instant_is_refused_whole(monkeypatch):
    admin, person = admin_and_person()
    token, access = acting(admin, person, minutes=15)
    # The clock the authentication reads says it is exactly the moment the visit ends. The token itself is still valid.
    monkeypatch.setattr('core.jwt_authentication.timezone', SimpleNamespace(now=lambda: access.ends_at))
    ended(client_for(token).get(ME))


def test_a_request_one_second_before_the_end_still_works(monkeypatch):
    admin, person = admin_and_person()
    token, access = acting(admin, person, minutes=15)
    monkeypatch.setattr('core.jwt_authentication.timezone', SimpleNamespace(now=lambda: access.ends_at - timedelta(seconds=1)))
    assert client_for(token).get(ME).status_code == 200


def test_ending_for_time_is_written_on_the_row():
    admin, person = admin_and_person()
    token, access = acting(admin, person)
    age(access, minutes=31)
    ended(client_for(token).get(ME))
    access.refresh_from_db()
    assert (access.status, access.ended_by) == ('ended', 'time')


def test_an_idle_admin_sign_in_does_not_end_the_visit():
    admin, person = admin_and_person()
    token, access = acting(admin, person)
    UserSession.objects.filter(pk=access.admin_session_id).update(last_activity_at=timezone.now() - timedelta(hours=3))
    assert client_for(token).get(ME).status_code == 200


# ── the claims alone are not trusted ──────────────────────────────────────────

def test_an_act_claim_on_an_ordinary_session_is_refused():
    admin, person = admin_and_person()
    _, ordinary = sign_in(person)
    token = AccessToken.for_user(person)
    token['sid'] = ordinary.id
    token['act'] = admin.pk
    ended(client_for(str(token)).get(ME))


def test_a_support_session_without_the_act_claim_is_refused():
    admin, person = admin_and_person()
    _, access = acting(admin, person)
    session = UserSession.objects.get(support_access_id=access.pk)
    token = AccessToken.for_user(person)
    token['sid'] = session.id
    ended(client_for(str(token)).get(ME))


def test_an_act_claim_naming_a_different_admin_is_refused():
    admin, person = admin_and_person()
    _, access = acting(admin, person)
    session = UserSession.objects.get(support_access_id=access.pk)
    token = AccessToken.for_user(person)
    token['sid'] = session.id
    token['act'] = UserFactory(role='ADMIN').pk
    ended(client_for(str(token)).get(ME))


# ── a support sign in is not one of the person's devices ──────────────────────

def test_the_devices_list_does_not_show_the_support_session():
    admin, person = admin_and_person()
    mine_token, mine = sign_in(person)
    _, access = acting(admin, person)
    shown = client_for(mine_token).get('/api/auth/sessions').json()['data']
    assert [row['id'] for row in shown] == [mine.id]
    support_session = UserSession.objects.get(support_access_id=access.pk)
    assert client_for(mine_token).delete(f'/api/auth/sessions/{support_session.id}').status_code == 404


def test_signing_out_everywhere_ends_the_visit():
    admin, person = admin_and_person()
    mine_token, _ = sign_in(person)
    token, access = acting(admin, person)
    assert client_for(mine_token).post('/api/auth/sessions/revoke-others').status_code == 200
    access.refresh_from_db()
    assert (access.status, access.ended_by) == ('ended', 'person')
    ended(client_for(token).get(ME))


def test_a_password_change_ends_the_visit():
    admin, person = admin_and_person()
    mine_token, _ = sign_in(person)
    token, access = acting(admin, person)
    response = client_for(mine_token).patch('/api/auth/change-password', {
        'current_password': 'Pass1234', 'new_password': 'NewPass123', 'confirm_password': 'NewPass123',
    }, format='json')
    assert response.status_code == 200, response.content
    access.refresh_from_db()
    assert access.status == SupportAccess.Status.ENDED
    ended(client_for(token).get(ME))


# ── what the page is told ─────────────────────────────────────────────────────

def test_the_page_can_tell_a_refused_write_from_a_refused_view(monkeypatch):
    # The codes of the two refusals of the rules (task 6) reach the page and do not become a "permission denied" event.
    from core.utils import SUPPORT_CODES
    assert {'support_ended', 'support_view_only', 'support_blocked'} <= set(SUPPORT_CODES)
