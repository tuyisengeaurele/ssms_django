"""Two-step sign in from inside the app, for a person who is signed in: turning it on and off.

The password is asked again. Without it, someone who borrowed a signed in phone could add their own authenticator app and
lock the owner out, or take the owner's away. A wrong password or code answers 422, never 401, so the website does not take it for an ended session,
and each one counts toward the email's lock.

Nothing here writes a password, a secret, a code or a recovery code to a log, an event or the audit log.
"""
import logging
from datetime import timedelta

from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core import lockout
from core.mail import send_email
from core.permissions import RolePermission
from core.throttles import MfaAccountThrottle, UserRateThrottle
from core.utils import api_error, api_success
from logs.security import record_security_event

from . import mfa
from .mfa_mail import mfa_email
from .models import SecondFactor, UserSession
from .sessions import end_all_but
from .signin import too_many_attempts

logger = logging.getLogger(__name__)

# Somebody who has just turned it off is not asked to turn it on again at their next sign in.
QUIET_AFTER_TURNING_OFF = timedelta(days=30)


def _refuse(code: str, status: int):
    return api_error(status_code=status, code=code)


def _sign_in_of(request):
    """The live sign in this request came with. None for a token from before sign ins were kept."""
    sid = getattr(request, 'session_id', None)
    return UserSession.objects.filter(pk=sid, user=request.user, revoked_at__isnull=True).first() if sid else None


def _miss(request, kind: str, why: str, code: str):
    """A wrong password or code: counted, noted, and answered with the sentence that goes with `code`.

    The count is never cleared by a right password alone, or someone holding it could keep guessing codes between two of
    them.
    """
    user = request.user
    lockout.record_failure(user.email)
    record_security_event(kind, request, user=user, detail=why)
    log_action(request, 'OTHER', 'User', user.pk, f'Wrong entry for the second factor: {why}', outcome='failure')
    wait = lockout.is_locked(user.email)
    return too_many_attempts(request, user.email, wait) if wait else _refuse(code, 422)


def _password_problem(request, why: str):
    """None when the password in the request is right, otherwise the answer to send."""
    wait = lockout.is_locked(request.user.email)
    if wait:
        return too_many_attempts(request, request.user.email, wait)
    password = request.data.get('password')
    if isinstance(password, str) and password and authenticate(request=request, email=request.user.email, password=password):
        return None
    return _miss(request, 'login_failed', why, 'wrong_password')


def _tell(kind: str, user) -> None:
    """A mail problem never undoes what the person did."""
    try:
        subject, email = mfa_email(kind, user)
        send_email(subject, [user.email], email)
    except Exception:
        logger.exception('Could not tell %s that two-step sign in changed', user.email)


class _AccountView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'second_factor'
    throttle_classes = [UserRateThrottle, MfaAccountThrottle]


class MfaEnrollStartView(_AccountView):
    actions = {'post': 'enroll'}

    def post(self, request):
        """POST /api/auth/mfa/enroll/start: the password, then a new secret that waits for a code from it."""
        if mfa.is_enabled(request.user):
            return _refuse('mfa_already_on', 409)
        if _sign_in_of(request) is None:
            return _refuse('mfa_start_again', 409)
        problem = _password_problem(request, 'Turning two-step sign in on')
        if problem:
            return problem
        factor, _ = SecondFactor.objects.get_or_create(user=request.user)
        secret = mfa.new_secret()
        factor.pending_secret_encrypted = mfa.encrypt(secret)
        factor.save(update_fields=['pending_secret_encrypted', 'updated_at'])
        return api_success({'secret': secret, 'otpauth_uri': mfa.otpauth_uri(request.user, secret)})


class MfaEnrollConfirmView(_AccountView):
    actions = {'post': 'enroll'}

    def post(self, request):
        """POST /api/auth/mfa/enroll/confirm: a good code turns it on, signs the other devices out and gives the recovery codes."""
        user = request.user
        if mfa.is_enabled(user):
            return _refuse('mfa_already_on', 409)
        session = _sign_in_of(request)
        factor = SecondFactor.objects.filter(user=user, enabled_at__isnull=True).exclude(pending_secret_encrypted='').first()
        if session is None or factor is None:
            return _refuse('mfa_start_again', 409)
        wait = lockout.is_locked(user.email)
        if wait:
            return too_many_attempts(request, user.email, wait)
        if not mfa.check_code(factor, request.data.get('code'), pending=True):
            return _miss(request, 'mfa_failed', 'Turning two-step sign in on', 'mfa_wrong_code')

        with transaction.atomic():
            factor.secret_encrypted = factor.pending_secret_encrypted
            factor.pending_secret_encrypted = ''
            factor.enabled_at = timezone.now()
            factor.save(update_fields=['secret_encrypted', 'pending_secret_encrypted', 'enabled_at', 'updated_at'])
            codes = mfa.new_recovery_codes(user)
            # This sign in has just shown a code. The others never did, so they end.
            session.mfa_verified_at = timezone.now()
            session.save(update_fields=['mfa_verified_at'])
            end_all_but(user, session, 'mfa_enrolled')
        lockout.clear(user.email)
        record_security_event('mfa_enrolled', request, user=user, detail='Turned on from Settings')
        log_action(request, 'UPDATE', 'User', user.pk, 'Turned on the second factor')
        _tell('on', user)
        return api_success({'recovery_codes': codes}, 'Two-step sign in is on.')


class MfaDisableView(_AccountView):
    actions = {'post': 'disable'}

    def post(self, request):
        """POST /api/auth/mfa/disable: the password, and a code from the app or a recovery code, turn it off."""
        user = request.user
        problem = _password_problem(request, 'Turning two-step sign in off')
        if problem:
            return problem
        factor = SecondFactor.objects.filter(user=user, enabled_at__isnull=False).first()
        if factor is None:
            return _refuse('mfa_not_on', 400)
        recovery = request.data.get('recovery_code')
        good = mfa.use_recovery_code(user, recovery) if recovery else mfa.check_code(factor, request.data.get('code'))
        if not good:
            return _miss(request, 'mfa_failed', 'Turning two-step sign in off', 'mfa_wrong_code')

        with transaction.atomic():
            mfa.reset(user)
            user.mfa_prompt_snoozed_until = timezone.now() + QUIET_AFTER_TURNING_OFF
            user.save(update_fields=['mfa_prompt_snoozed_until'])
            end_all_but(user, _sign_in_of(request), 'mfa_disabled')
        lockout.clear(user.email)
        record_security_event('mfa_disabled', request, user=user)
        log_action(request, 'UPDATE', 'User', user.pk, 'Turned off the second factor')
        _tell('off', user)
        return api_success(None, 'Two-step sign in is off.')
