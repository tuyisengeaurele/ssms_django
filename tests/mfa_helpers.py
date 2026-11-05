"""Shared by tests that need an admin signed in. An admin signs in with a password and then a code, so a test does both."""
import time

import pyotp
from django.utils import timezone

from users import mfa
from users.models import SecondFactor

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
