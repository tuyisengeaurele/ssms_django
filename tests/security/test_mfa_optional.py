"""Two-step sign in for everyone: farmers and supervisors may turn it on, admins must have it.

Secrets and codes are made at run time.
"""
import pytest
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from tests.factories import UserFactory
from tests.mfa_helpers import PASSWORD, client_with, enable_factor, session_for, totp
from tests.support_helpers import acting, admin_and_person
from users import mfa, mfa_challenge
from users.cookie_utils import REFRESH_COOKIE
from users.models import SecondFactor, UserSession

pytestmark = pytest.mark.django_db

LOGIN = '/api/auth/login'
VERIFY = '/api/auth/mfa/verify'
SETUP_START = '/api/auth/mfa/setup/start'
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


# ── signing in ──────────────────────────────────────────────────────────────────────────────

def password_step(user, password=PASSWORD):
    client = APIClient()
    return client, client.post(LOGIN, {'email': user.email, 'password': password}, format='json')


def with_it_on(role='FARMER'):
    user = UserFactory(role=role)
    return user, enable_factor(user)


@pytest.mark.parametrize('role', OPTIONAL_ROLES)
def test_a_person_with_it_on_gets_the_code_step_and_no_session(role):
    user, _ = with_it_on(role)
    _, response = password_step(user)
    data = response.json()['data']
    assert response.status_code == 200
    assert data['mfa']['step'] == 'code' and data['mfa']['challenge']
    assert 'token' not in data and REFRESH_COOKIE not in response.cookies
    assert not UserSession.objects.filter(user=user).exists()


@pytest.mark.parametrize('role', OPTIONAL_ROLES)
def test_a_good_app_code_finishes_the_sign_in(role):
    user, secret = with_it_on(role)
    client, first = password_step(user)
    response = client.post(VERIFY, {'challenge': first.json()['data']['mfa']['challenge'], 'code': totp(secret)}, format='json')
    assert response.status_code == 200 and response.json()['data']['token']
    assert REFRESH_COOKIE in response.cookies
    session = UserSession.objects.get(user=user)
    assert session.mfa_verified_at is not None and session.is_shared_device is False


def test_a_shared_computer_stays_shared_through_the_code_step():
    user, secret = with_it_on()
    client, first = password_step(user)
    client.post(VERIFY, {'challenge': first.json()['data']['mfa']['challenge'], 'code': totp(secret), 'shared_device': True},
                format='json')
    assert UserSession.objects.get(user=user).is_shared_device is True


def test_a_recovery_code_finishes_it_once():
    user, _ = with_it_on()
    code = mfa.new_recovery_codes(user)[0]

    def attempt():
        client, first = password_step(user)
        return client.post(VERIFY, {'challenge': first.json()['data']['mfa']['challenge'], 'recovery_code': code}, format='json')

    assert attempt().status_code == 200
    assert attempt().status_code == 401


def test_wrong_codes_count_toward_the_lock():
    user, secret = with_it_on()
    client, first = password_step(user)
    challenge = first.json()['data']['mfa']['challenge']
    wrong = '000000' if totp(secret) != '000000' else '111111'
    codes = [client.post(VERIFY, {'challenge': challenge, 'code': wrong}, format='json').status_code for _ in range(5)]
    assert codes[-1] == 429
    _, again = password_step(user)
    assert again.status_code == 429


def test_the_right_password_alone_does_not_clear_the_count_of_wrong_ones():
    user, _ = with_it_on()
    for _ in range(4):
        password_step(user, 'not-the-password')
    password_step(user)   # right, but no code yet
    _, fifth = password_step(user, 'not-the-password')
    _, after = password_step(user)
    assert after.status_code == 429


def test_a_set_up_challenge_is_refused_for_a_farmer():
    farmer = UserFactory(role='FARMER')
    response = APIClient().post(SETUP_START, {'challenge': mfa_challenge.issue(farmer, 'setup')}, format='json')
    assert response.status_code == 401 and response.data['reason'] == 'challenge'
    assert not SecondFactor.objects.filter(user=farmer).exists()


def test_a_reset_during_the_code_step_starts_over_and_the_password_alone_then_signs_in():
    user, secret = with_it_on()
    client, first = password_step(user)
    mfa.reset(user)
    response = client.post(VERIFY, {'challenge': first.json()['data']['mfa']['challenge'], 'code': totp(secret)}, format='json')
    assert response.status_code == 401 and response.data['reason'] == 'challenge'
    _, again = password_step(user)
    assert again.json()['data']['token']


def test_a_password_reset_does_not_turn_it_off():
    user, _ = with_it_on()
    link = {'uid': urlsafe_base64_encode(force_bytes(user.pk)), 'token': default_token_generator.make_token(user),
            'new_password': 'Another-Pass-2468'}
    assert APIClient().post('/api/auth/password-reset/confirm', link, format='json').status_code == 200
    _, response = password_step(user, 'Another-Pass-2468')
    data = response.json()['data']
    assert data['mfa']['step'] == 'code' and 'token' not in data
