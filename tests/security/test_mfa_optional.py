"""Two-step sign in for everyone: farmers and supervisors may turn it on, admins must have it.

Secrets and codes are made at run time.
"""
import pytest
from rest_framework.test import APIClient

from tests.factories import UserFactory
from tests.mfa_helpers import client_with, enable_factor, session_for, totp
from tests.support_helpers import acting, admin_and_person
from users import mfa

pytestmark = pytest.mark.django_db

STATUS = '/api/auth/mfa'
NEW_CODES = '/api/auth/mfa/recovery-codes'

OPTIONAL_ROLES = ['FARMER', 'SUPERVISOR']


def signed_in(user, **session):
    return client_with(user, session_for(user, **session))


# ── who may look at it ──────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', OPTIONAL_ROLES)
def test_a_farmer_or_supervisor_reads_their_own_status(role):
    response = signed_in(UserFactory(role=role)).get(STATUS)
    assert response.status_code == 200
    data = response.data['data']
    assert (data['enabled'], data['required'], data['recovery_codes_left']) == (False, False, 0)


def test_an_admin_is_told_it_is_required():
    admin = UserFactory(role='ADMIN')
    enable_factor(admin)
    data = signed_in(admin, verified_minutes_ago=0).get(STATUS).data['data']
    assert data['required'] is True and data['enabled'] is True


def test_the_status_is_only_ever_the_callers_own():
    enable_factor(UserFactory(role='FARMER'))
    assert signed_in(UserFactory(role='FARMER')).get(STATUS).data['data']['enabled'] is False


# ── new recovery codes ──────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', OPTIONAL_ROLES)
def test_a_person_with_it_on_can_make_new_recovery_codes_with_an_app_code(role):
    user = UserFactory(role=role)
    secret = enable_factor(user)
    response = signed_in(user).post(NEW_CODES, {'code': totp(secret)}, format='json')
    assert response.status_code == 200
    assert len(response.data['data']['recovery_codes']) == 8
    assert mfa.recovery_codes_left(user) == 8


def test_new_recovery_codes_need_it_to_be_on():
    response = signed_in(UserFactory(role='FARMER')).post(NEW_CODES, {'code': '123456'}, format='json')
    assert response.status_code == 400


def test_a_stranger_is_still_told_to_sign_in():
    assert APIClient().get(STATUS).status_code == 401


# ── support visits ──────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('mode', ['view', 'edit'])
def test_a_support_visit_cannot_read_or_change_it(mode):
    admin, person = admin_and_person('FARMER')
    enable_factor(person)
    token, _ = acting(admin, person, mode=mode)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    for response in (client.get(STATUS), client.post(NEW_CODES, {'code': '123456'}, format='json')):
        assert response.status_code == 403
        assert response.data['code'] == 'support_blocked'
