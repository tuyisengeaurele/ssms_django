"""
Public endpoints must ignore a stale token, and error messages must read kindly.
"""
from django.contrib.auth import get_user_model
from django.http import Http404
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.exceptions import (
    AuthenticationFailed, NotAuthenticated, NotFound, ParseError, PermissionDenied, Throttled,
)
from rest_framework.test import APITestCase

from core.utils import custom_exception_handler

User = get_user_model()

STALE = {'HTTP_AUTHORIZATION': 'Bearer this.is.not-a-real-token'}
NO_THROTTLE = {'DEFAULT_THROTTLE_CLASSES': [], 'DEFAULT_THROTTLE_RATES': {}}


def rest_settings():
    from django.conf import settings
    return {**settings.REST_FRAMEWORK, **NO_THROTTLE}


@override_settings(REST_FRAMEWORK=rest_settings())
class PublicEndpointsIgnoreStaleTokens(APITestCase):
    """A leftover token in the browser must never block signing in."""

    def setUp(self):
        self.user = User.objects.create_user(
            email='farmer@test.com', password='Pass1234', name='Farmer', role='FARMER',
        )
        self.user.is_email_verified = True
        self.user.save()

    def test_login_works_with_a_stale_token(self):
        res = self.client.post(
            '/api/auth/login', {'email': 'farmer@test.com', 'password': 'Pass1234'}, format='json', **STALE,
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.json()['success'])

    def test_wrong_password_with_a_stale_token_says_so_kindly(self):
        res = self.client.post(
            '/api/auth/login', {'email': 'farmer@test.com', 'password': 'nope'}, format='json', **STALE,
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.json()['message'], "That email or password doesn't look right. Please try again.")

    def test_register_works_with_a_stale_token(self):
        res = self.client.post(
            '/api/auth/register',
            {'name': 'New Person', 'email': 'new@test.com', 'password': 'SecurePass1'},
            format='json', **STALE,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_password_reset_request_works_with_a_stale_token(self):
        res = self.client.post('/api/auth/password-reset/request', {'email': 'farmer@test.com'}, format='json', **STALE)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_resend_verification_works_with_a_stale_token(self):
        res = self.client.post('/api/auth/resend-verification', {'email': 'farmer@test.com'}, format='json', **STALE)
        self.assertNotEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_token_refresh_without_a_cookie_is_not_blocked_by_a_stale_token(self):
        res = self.client.post('/api/auth/token/refresh', {}, format='json', **STALE)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.json()['message'], 'Your session has ended. Please sign in again.')

    def test_private_pages_still_need_a_real_token(self):
        res = self.client.get('/api/auth/me', **STALE)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.json()['message'], 'Your session has ended. Please sign in again.')


class FriendlyErrorMessages(SimpleTestCase):
    def message(self, exc):
        return custom_exception_handler(exc, {}).data['message']

    def test_not_signed_in(self):
        self.assertEqual(self.message(NotAuthenticated()), 'Please sign in to continue.')

    def test_expired_session(self):
        from rest_framework_simplejwt.exceptions import InvalidToken
        self.assertEqual(self.message(InvalidToken()), 'Your session has ended. Please sign in again.')

    def test_turned_off_account_keeps_its_own_message(self):
        exc = AuthenticationFailed('x', code='user_inactive')
        self.assertEqual(
            self.message(exc),
            'This account has been turned off. Please contact your administrator.',
        )

    def test_no_permission(self):
        self.assertEqual(self.message(PermissionDenied()), "You don't have permission to do that.")

    def test_not_found(self):
        self.assertEqual(self.message(NotFound()), "We couldn't find what you were looking for.")
        self.assertEqual(self.message(Http404()), "We couldn't find what you were looking for.")

    def test_unreadable_request(self):
        self.assertEqual(self.message(ParseError()), "We couldn't read that request. Please check it and try again.")

    def test_too_many_requests_says_how_long_to_wait(self):
        self.assertEqual(self.message(Throttled(wait=42)), 'Too many attempts. Please try again in 42 seconds.')

    def test_too_many_requests_without_a_time(self):
        self.assertEqual(self.message(Throttled()), 'Too many attempts. Please wait a moment and try again.')

    def test_messages_have_no_dashes_or_jargon(self):
        for exc in (NotAuthenticated(), PermissionDenied(), NotFound(), ParseError(), Throttled(wait=3)):
            text = self.message(exc)
            self.assertNotIn(chr(0x2014), text)
            self.assertNotIn(chr(0x2013), text)
            self.assertNotRegex(text, r'(?i)token|credentials|forbidden|unauthori[sz]ed|resource')
