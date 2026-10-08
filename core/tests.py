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

    def test_expired_session_reply_carries_no_technical_details(self):
        res = self.client.get('/api/auth/me', **STALE)
        self.assertNotIn('errors', res.json())

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


class FriendlyWordingInSource(SimpleTestCase):
    """Every message a person can read must be kind, plain and free of internals."""

    BANNED = [
        (r'Forbidden', 'say what the person cannot do instead'),
        (r'Insufficient', 'say what the person cannot do instead'),
        (r'Validation failed', 'ask them to check what they entered'),
        (r'AI service|port \d{4}|\{exc\}|\{response', 'do not expose internals'),
        (r'Invalid or expired', 'explain the next step'),
        (r'\b(uid|newPassword|batchId)\b', 'do not name request fields'),
        (r'is required\.', 'ask politely, for example "Please enter ..."'),
        (r'\b\w+ not found\.', 'say "We couldn\'t find that ..."'),
        (r'\bmust\b', 'say what is needed instead'),
        (r'access required|out of range', 'say it in plain words'),
    ]

    def messages(self):
        import ast
        import pathlib

        root = pathlib.Path(__file__).resolve().parent.parent
        skip = {'venv', 'migrations', 'node_modules', 'scripts', 'frontend', 'ai_service', 'docs'}
        for path in root.rglob('*.py'):
            parts = set(path.relative_to(root).parts)
            if parts & skip or path.name.startswith('test'):
                continue
            tree = ast.parse(path.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call):
                    continue
                func = node.func
                name = getattr(func, 'id', None) or getattr(func, 'attr', None)
                if name not in ('api_error', 'ValidationError'):
                    continue
                for sub in ast.walk(node):
                    if isinstance(sub, ast.Constant) and isinstance(sub.value, str):
                        yield path.relative_to(root), sub.lineno, sub.value

    def test_no_message_uses_cold_or_technical_wording(self):
        import re

        problems = []
        for path, line, text in self.messages():
            for pattern, hint in self.BANNED:
                if re.search(pattern, text):
                    problems.append(f'{path}:{line}: {text!r} ({hint})')
        self.assertEqual(problems, [], '\n' + '\n'.join(problems))

    def test_no_message_uses_dashes(self):
        for path, line, text in self.messages():
            self.assertNotIn(chr(0x2014), text, f'{path}:{line}')
            self.assertNotIn(chr(0x2013), text, f'{path}:{line}')
