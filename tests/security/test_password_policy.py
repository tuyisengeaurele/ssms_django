from unittest import mock

import pytest
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.exceptions import ValidationError

from core.validators import ComplexityValidator, validate_new_password
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STRONG = 'Zebra-Quartz-84'
REGISTER = '/api/auth/register'
CHANGE = '/api/auth/change-password'
RESET_REQUEST = '/api/auth/password-reset/request'
RESET_CONFIRM = '/api/auth/password-reset/confirm'
RESEND = '/api/auth/resend-verification'


# ── the validator on its own ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('password, code', [
    ('alllower1', 'password_no_upper'),
    ('ALLUPPER1', 'password_no_lower'),
    ('NoDigitsHere', 'password_no_digit'),
])
def test_complexity_validator_names_what_is_missing(password, code):
    with pytest.raises(DjangoValidationError) as caught:
        ComplexityValidator().validate(password)
    assert code in [e.code for e in caught.value.error_list]


def test_complexity_validator_accepts_a_mixed_password():
    ComplexityValidator().validate('Mixed1case')


@pytest.mark.parametrize('password, fragment', [
    ('Short1a', 'at least 8 characters'),
    ('alllower1', 'uppercase letter'),
    ('ALLUPPER1', 'lowercase letter'),
    ('NoDigitsHere', 'number'),
    ('Password1', 'too common'),
])
def test_friendly_messages_for_each_rule(password, fragment):
    with pytest.raises(ValidationError) as caught:
        validate_new_password(password)
    text = ' '.join(str(e) for e in caught.value.detail)
    assert fragment in text
    assert 'This password' not in text  # Django's own cold wording never reaches the person


def test_a_password_close_to_the_email_is_refused():
    user = UserFactory(email='zebraquartz@example.rw')
    with pytest.raises(ValidationError) as caught:
        validate_new_password('Zebraquartz1', user)
    assert 'too close' in ' '.join(str(e) for e in caught.value.detail)


def test_a_strong_password_passes():
    validate_new_password(STRONG)


# ── every place a password is set uses the same rules ───────────────────────────────────────

def test_register_rejects_a_common_password(api_client):
    response = api_client.post(REGISTER, {'name': 'Aline', 'email': 'aline@example.rw', 'password': 'Password1'}, format='json')
    assert response.status_code == 422
    assert 'password' in response.json()['errors']


def test_register_rejects_a_password_close_to_the_email(api_client):
    response = api_client.post(REGISTER, {'name': 'Zed', 'email': 'zebraquartz@example.rw', 'password': 'Zebraquartz1'}, format='json')
    assert response.status_code == 422


def test_register_accepts_a_strong_password(api_client):
    response = api_client.post(REGISTER, {'name': 'Aline', 'email': 'aline@example.rw', 'password': STRONG}, format='json')
    assert response.status_code == 201


def test_change_password_rejects_a_common_password(auth_client):
    user = UserFactory()
    response = auth_client(user).patch(
        CHANGE, {'currentPassword': 'Pass1234', 'newPassword': 'Password1', 'confirmPassword': 'Password1'}, format='json',
    )
    assert response.status_code == 422
    assert 'too common' in response.json()['message']


def test_change_password_rejects_the_email_local_part(auth_client):
    user = UserFactory(email='zebraquartz@example.rw')
    response = auth_client(user).patch(
        CHANGE, {'currentPassword': 'Pass1234', 'newPassword': 'Zebraquartz1', 'confirmPassword': 'Zebraquartz1'}, format='json',
    )
    assert response.status_code == 422


def reset_body(user, password):
    return {
        'uid': urlsafe_base64_encode(force_bytes(user.pk)),
        'token': default_token_generator.make_token(user),
        'newPassword': password,
    }


def test_reset_rejects_a_common_password(api_client):
    user = UserFactory()
    response = api_client.post(RESET_CONFIRM, reset_body(user, 'Password1'), format='json')
    assert response.status_code == 422
    assert 'too common' in response.json()['message']


def test_reset_accepts_a_strong_password_and_it_works_for_login(api_client):
    user = UserFactory()
    assert api_client.post(RESET_CONFIRM, reset_body(user, STRONG), format='json').status_code == 200
    login = api_client.post('/api/auth/login', {'email': user.email, 'password': STRONG}, format='json')
    assert login.status_code == 200


# ── recovery emails never reveal who has an account ─────────────────────────────────────────

def test_reset_request_answers_the_same_for_a_known_and_an_unknown_address(api_client):
    UserFactory(email='known@example.rw')
    known = api_client.post(RESET_REQUEST, {'email': 'known@example.rw'}, format='json')
    unknown = api_client.post(RESET_REQUEST, {'email': 'nobody@example.rw'}, format='json')
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def test_reset_request_survives_a_mail_failure_with_the_same_answer(api_client):
    UserFactory(email='known@example.rw')
    unknown = api_client.post(RESET_REQUEST, {'email': 'nobody@example.rw'}, format='json')
    with mock.patch('users.password_reset_views.send_mail', side_effect=OSError('smtp down')):
        known = api_client.post(RESET_REQUEST, {'email': 'known@example.rw'}, format='json')
    assert known.status_code == 200
    assert known.json() == unknown.json()


def test_resend_verification_says_the_same_for_verified_unknown_unverified_and_off_accounts(api_client):
    UserFactory(email='verified@example.rw', is_email_verified=True)
    UserFactory(email='waiting@example.rw', is_email_verified=False)
    UserFactory(email='off@example.rw', is_email_verified=False, is_active=False)
    answers = [
        api_client.post(RESEND, {'email': address}, format='json')
        for address in ('verified@example.rw', 'nobody@example.rw', 'waiting@example.rw', 'off@example.rw')
    ]
    assert {r.status_code for r in answers} == {200}
    assert len({str(r.json()) for r in answers}) == 1


def test_resend_verification_survives_a_mail_failure(api_client):
    UserFactory(email='waiting@example.rw', is_email_verified=False)
    with mock.patch('users.email_verification_views.send_mail', side_effect=OSError('smtp down')):
        response = api_client.post(RESEND, {'email': 'waiting@example.rw'}, format='json')
    assert response.status_code == 200
