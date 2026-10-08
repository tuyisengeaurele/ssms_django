"""
Unit tests for authentication:
  - RegisterView  (POST /api/auth/register)
  - LoginView     (POST /api/auth/login)
  - ProfileView   (GET/PATCH /api/auth/me)
  - ActiveUserJWTAuthentication, inactive user is rejected
"""
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model

User = get_user_model()

REGISTER_URL = '/api/auth/register'
LOGIN_URL    = '/api/auth/login'
PROFILE_URL  = '/api/auth/me'

# Disable throttle globally for all tests in this module
NO_THROTTLE = {'DEFAULT_THROTTLE_CLASSES': [], 'DEFAULT_THROTTLE_RATES': {}}


def make_user(email='farmer@test.com', password='Pass1234', name='Test Farmer', role='FARMER', is_active=True):
    return User.objects.create_user(
        email=email, password=password, name=name, role=role, is_active=is_active, is_email_verified=True,
    )


@override_settings(REST_FRAMEWORK={
    **{k: v for k, v in __import__('django.conf', fromlist=['settings']).settings.REST_FRAMEWORK.items()},
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {},
})
class RegisterViewTests(APITestCase):
    """POST /api/auth/register"""

    def test_register_success(self):
        payload = {'name': 'Alice', 'email': 'alice@test.com', 'password': 'SecurePass1'}
        res = self.client.post(REGISTER_URL, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['data']['user']['email'], 'alice@test.com')
        # The person confirms their email first, so no sign in token is handed out yet.
        self.assertNotIn('token', data['data'])
        self.assertFalse(data['data']['user']['isEmailVerified'])

    def test_register_duplicate_email(self):
        make_user(email='dup@test.com')
        payload = {'name': 'Bob', 'email': 'dup@test.com', 'password': 'SecurePass1'}
        res = self.client.post(REGISTER_URL, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.assertFalse(res.json()['success'])

    def test_register_weak_password_no_uppercase(self):
        payload = {'name': 'Carol', 'email': 'carol@test.com', 'password': 'alllower1'}
        res = self.client.post(REGISTER_URL, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

    def test_register_weak_password_no_digit(self):
        payload = {'name': 'Dave', 'email': 'dave@test.com', 'password': 'NoDigitsHere'}
        res = self.client.post(REGISTER_URL, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

    def test_register_too_short_password(self):
        payload = {'name': 'Eve', 'email': 'eve@test.com', 'password': 'Ab1'}
        res = self.client.post(REGISTER_URL, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

    def test_register_default_role_is_farmer(self):
        payload = {'name': 'Frank', 'email': 'frank@test.com', 'password': 'SecurePass1'}
        res = self.client.post(REGISTER_URL, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.json()['data']['user']['role'], 'FARMER')

    def test_register_ignores_a_requested_admin_role(self):
        payload = {'name': 'Grace', 'email': 'grace@test.com', 'password': 'SecurePass1', 'role': 'ADMIN'}
        res = self.client.post(REGISTER_URL, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # Public sign up is always a farmer account, whatever the request asks for.
        self.assertEqual(res.json()['data']['user']['role'], 'FARMER')

    def test_register_email_normalised_lowercase(self):
        payload = {'name': 'Hank', 'email': 'HANK@TEST.COM', 'password': 'SecurePass1'}
        res = self.client.post(REGISTER_URL, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.json()['data']['user']['email'], 'hank@test.com')


@override_settings(REST_FRAMEWORK={
    **{k: v for k, v in __import__('django.conf', fromlist=['settings']).settings.REST_FRAMEWORK.items()},
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {},
})
class LoginViewTests(APITestCase):
    """POST /api/auth/login"""

    def setUp(self):
        self.user = make_user(email='login@test.com', password='Pass1234')

    def test_login_success(self):
        res = self.client.post(LOGIN_URL, {'email': 'login@test.com', 'password': 'Pass1234'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertIn('token', data['data'])
        # The refresh token travels in an httpOnly cookie, never in the body.
        self.assertNotIn('refreshToken', data['data'])
        self.assertIn('ssms_refresh', res.cookies)

    def test_login_wrong_password(self):
        res = self.client.post(LOGIN_URL, {'email': 'login@test.com', 'password': 'WrongPass1'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(res.json()['success'])

    def test_login_unknown_email(self):
        res = self.client.post(LOGIN_URL, {'email': 'nobody@test.com', 'password': 'Pass1234'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_inactive_user_rejected(self):
        """Deactivated accounts must not receive a token."""
        make_user(email='inactive@test.com', password='Pass1234', is_active=False)
        res = self.client.post(LOGIN_URL, {'email': 'inactive@test.com', 'password': 'Pass1234'}, format='json')
        # Django's authenticate() returns None for inactive users → 401
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_email_case_insensitive(self):
        res = self.client.post(LOGIN_URL, {'email': 'LOGIN@TEST.COM', 'password': 'Pass1234'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_login_missing_fields(self):
        res = self.client.post(LOGIN_URL, {'email': 'login@test.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)


class ProfileViewTests(APITestCase):
    """GET/PATCH /api/auth/me, uses force_authenticate (not testing login)."""

    def setUp(self):
        self.user = make_user(email='profile@test.com', password='Pass1234', name='Original Name')
        self.client.force_authenticate(user=self.user)

    def test_get_profile(self):
        res = self.client.get(PROFILE_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['data']['email'], 'profile@test.com')

    def test_patch_profile_name(self):
        res = self.client.patch(PROFILE_URL, {'name': 'Updated Name'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['data']['name'], 'Updated Name')
        self.user.refresh_from_db()
        self.assertEqual(self.user.name, 'Updated Name')

    def test_patch_profile_empty_name(self):
        res = self.client.patch(PROFILE_URL, {'name': ''}, format='json')
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

    def test_patch_profile_name_too_long(self):
        res = self.client.patch(PROFILE_URL, {'name': 'A' * 101}, format='json')
        self.assertEqual(res.status_code, status.HTTP_422_UNPROCESSABLE_ENTITY)

    def test_profile_unauthenticated(self):
        self.client.force_authenticate(user=None)
        res = self.client.get(PROFILE_URL)
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class ActiveUserJWTAuthenticationTests(APITestCase):
    """
    Verify that a previously-valid JWT is rejected after the account is
    deactivated (ActiveUserJWTAuthentication guard).

    We obtain a real token via the login endpoint (throttle disabled) then
    deactivate the account and confirm the token no longer works.
    """

    def setUp(self):
        self.user = make_user(email='jwt@test.com', password='Pass1234')

    def _get_real_token(self):
        """Obtain a JWT by calling the login endpoint (throttle off)."""
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(self.user)
        return str(refresh.access_token)

    def test_active_user_can_access_profile(self):
        token = self._get_real_token()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        res = self.client.get(PROFILE_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_deactivated_user_jwt_rejected(self):
        """After deactivation the existing token should be rejected."""
        token = self._get_real_token()
        # Deactivate the account
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        res = self.client.get(PROFILE_URL)
        # ActiveUserJWTAuthentication raises AuthenticationFailed → 401
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(REST_FRAMEWORK={
    **{k: v for k, v in __import__('django.conf', fromlist=['settings']).settings.REST_FRAMEWORK.items()},
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {},
})
class AdminUserListStatusTests(APITestCase):
    """The user list says whether each account is switched on."""

    def setUp(self):
        self.admin = make_user(email='boss@test.com', role='ADMIN', name='Boss')
        self.client.force_authenticate(self.admin)

    def test_list_marks_a_turned_off_account(self):
        make_user(email='on@test.com', name='On')
        make_user(email='off@test.com', name='Off', is_active=False)
        res = self.client.get('/api/admin/users')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        by_email = {u['email']: u for u in res.json()['data']}
        self.assertTrue(by_email['on@test.com']['isActive'])
        self.assertFalse(by_email['off@test.com']['isActive'])
