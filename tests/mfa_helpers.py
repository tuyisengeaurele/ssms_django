"""Shared by tests that need an admin signed in. An admin signs in with a password and then a code, so a test does both."""
import time
from datetime import timedelta

import pyotp
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from users import mfa
from users.models import SecondFactor, UserSession

PASSWORD = 'Pass1234'   # what UserFactory gives every user


def totp(secret, moment=None):
    return pyotp.TOTP(secret).at(time.time() if moment is None else moment)


def enable_factor(user):
    """Give the user a working authenticator app. Returns the secret, which is what the phone would hold."""
    secret = pyotp.random_base32()
    SecondFactor.objects.update_or_create(user=user, defaults={
        'secret_encrypted': mfa.encrypt(secret), 'pending_secret_encrypted': '',
        'enabled_at': timezone.now(), 'last_step': 0,
    })
    return secret


def sign_in_admin(client, user, secret=None, **body):
    """The whole two step sign in. Returns the final response.

    A code works once, and a test may sign in several times within the same 30 seconds, so this starts the replay
    counter over each time. That shortcut is only for tests.
    """
    secret = secret or enable_factor(user)
    SecondFactor.objects.filter(user=user).update(last_step=0)
    first = client.post('/api/auth/login', {'email': user.email, 'password': PASSWORD}, format='json')
    challenge = first.json()['data']['mfa']['challenge']
    return client.post('/api/auth/mfa/verify', {'challenge': challenge, 'code': totp(secret), **body}, format='json')


def session_for(user, verified_minutes_ago=None):
    """A live session. `verified_minutes_ago` None means a code was never checked in it."""
    now = timezone.now()
    verified = None if verified_minutes_ago is None else now - timedelta(minutes=verified_minutes_ago)
    return UserSession.objects.create(
        user=user, last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now), mfa_verified_at=verified,
    )


def client_with(user, session=None):
    """A client holding a real access token. `session` None makes a token from before sessions existed (no `sid`)."""
    token = AccessToken.for_user(user)
    if session is not None:
        token['sid'] = session.id
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client
