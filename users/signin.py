"""The end of a sign in, shared by the password step (farmers and supervisors) and the code step (admins)."""
import math

from audit_log.utils import log_action
from core.utils import api_error, api_success
from logs.security import record_security_event

from .cookie_utils import set_refresh_cookie
from .serializers import UserSerializer
from .sessions import start_session


def shared_flag(request) -> bool:
    """Only a real tick counts. Text such as "yes" or a number is not one."""
    return request.data.get('shared_device', request.data.get('sharedDevice')) is True


def too_many_attempts(request, email: str, wait: int):
    """The answer for an email that is locked for `wait` seconds."""
    minutes = max(1, math.ceil(wait / 60))
    unit = 'minute' if minutes == 1 else 'minutes'
    record_security_event('lockout', request, detail=email)
    return api_error(f'Too many attempts. Please try again in {minutes} {unit}.', 429)


def finish_sign_in(request, user, *, mfa_verified: bool, extra: dict | None = None):
    """Start the session and answer with the person, the access token and the refresh cookie.

    `mfa_verified` says a code from the authenticator app was just accepted, and is written on the session.
    `extra` adds fields to the answer, for example the recovery codes shown once after set-up.
    """
    session, access, refresh = start_session(request, user, request.data.get('device'), shared_flag(request), mfa_verified=mfa_verified)
    record_security_event('login_ok', request, user=user, detail=session.device_label)
    log_action(request, 'LOGIN', 'User', user.pk, f'Login: {user.email}', actor=user)
    response = api_success({'user': UserSerializer(user).data, 'token': access, **(extra or {})}, 'Logged in successfully.')
    set_refresh_cookie(response, refresh)
    return response
