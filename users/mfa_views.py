"""The code step of an admin's sign in, and the first time set-up of the authenticator app.

None of these needs a session: the caller holds a challenge (users/mfa_challenge.py) from a correct password. They are
open to anyone on purpose, throttled per address, and add no detail about why a challenge is refused.

Nothing here writes a code, a secret, a challenge or a recovery code to a log, an event or the audit log.
"""
import logging

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core import lockout
from core.mail import Email, send_email
from core.mfa_guard import require_recent_mfa
from core.permissions import RolePermission
from core.throttles import MfaRateThrottle
from core.utils import api_error, api_success
from logs.security import record_security_event

from . import mfa, mfa_challenge
from .models import Role, SecondFactor, UserSession
from .signin import finish_sign_in, too_many_attempts

User = get_user_model()
logger = logging.getLogger(__name__)

CHALLENGE_GONE = 'That sign in took too long. Please start again.'
WRONG_CODE = "That code isn't right. Please try again."


def _start_over(message: str = CHALLENGE_GONE):
    """The challenge is no good. `reason` tells the page to go back to the password step."""
    response = api_error(message, 401)
    response.data['reason'] = 'challenge'
    return response


def _open(request, step: str):
    """The challenge in the request and the admin it names. Returns (held, user, None) or (None, None, answer)."""
    try:
        held = mfa_challenge.read(request.data.get('challenge'))
    except mfa_challenge.ChallengeError:
        return None, None, _start_over()
    user = User.objects.filter(pk=held.user_id, is_active=True, role=Role.ADMIN).first()
    if held.step != step or user is None:
        return None, None, _start_over()
    return held, user, None


def _wrong(request, user, held):
    """A wrong code or recovery code. It counts against the email, so guessing across challenges still stops at five."""
    lockout.record_failure(user.email)
    record_security_event('mfa_failed', request, user=user)
    log_action(request, 'OTHER', 'User', user.pk, 'Wrong second factor code', actor=user, outcome='failure')
    dead = mfa_challenge.wrong_code(held)
    wait = lockout.is_locked(user.email)
    if wait:
        return too_many_attempts(request, user.email, wait)
    if dead:
        return _start_over('Too many wrong codes. Please sign in again.')
    return api_error(WRONG_CODE, 401)


class _MfaView(APIView):
    # A leftover token in the browser must not block a public page.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [MfaRateThrottle]


class MfaVerifyView(_MfaView):
    def post(self, request):
        """POST /api/auth/mfa/verify: a code from the app, or a recovery code, finishes an admin's sign in."""
        held, user, problem = _open(request, 'code')
        if problem:
            return problem
        wait = lockout.is_locked(user.email)
        if wait:
            return too_many_attempts(request, user.email, wait)
        factor = SecondFactor.objects.filter(user=user, enabled_at__isnull=False).first()
        if factor is None:
            # Reset while the admin was typing. Starting over leads to set-up.
            return _start_over()

        recovery = request.data.get('recovery_code')
        if recovery:
            good = mfa.use_recovery_code(user, recovery)
        else:
            good = mfa.check_code(factor, request.data.get('code'))
        if not good:
            return _wrong(request, user, held)

        lockout.clear(user.email)
        mfa_challenge.spend(held)
        record_security_event('mfa_recovery_used' if recovery else 'mfa_ok', request, user=user)
        return finish_sign_in(request, user, mfa_verified=True)


class MfaSetupStartView(_MfaView):
    def post(self, request):
        """POST /api/auth/mfa/setup/start: a new secret waits until a code from it is confirmed."""
        _, user, problem = _open(request, 'setup')
        if problem:
            return problem
        factor, _ = SecondFactor.objects.get_or_create(user=user)
        if factor.enabled_at is not None:
            return _start_over()
        secret = mfa.new_secret()
        factor.pending_secret_encrypted = mfa.encrypt(secret)
        factor.save(update_fields=['pending_secret_encrypted', 'updated_at'])
        return api_success({'secret': secret, 'otpauth_uri': mfa.otpauth_uri(user, secret)})


class MfaSetupConfirmView(_MfaView):
    def post(self, request):
        """POST /api/auth/mfa/setup/confirm: a good code from the new secret turns it on and signs the admin in."""
        held, user, problem = _open(request, 'setup')
        if problem:
            return problem
        wait = lockout.is_locked(user.email)
        if wait:
            return too_many_attempts(request, user.email, wait)
        factor = SecondFactor.objects.filter(user=user, enabled_at__isnull=True).exclude(pending_secret_encrypted='').first()
        if factor is None:
            return api_error('Please start the set-up again.', 400)
        if not mfa.check_code(factor, request.data.get('code'), pending=True):
            return _wrong(request, user, held)

        with transaction.atomic():
            factor.secret_encrypted = factor.pending_secret_encrypted
            factor.pending_secret_encrypted = ''
            factor.enabled_at = timezone.now()
            factor.save(update_fields=['secret_encrypted', 'pending_secret_encrypted', 'enabled_at', 'updated_at'])
            codes = mfa.new_recovery_codes(user)
        lockout.clear(user.email)
        mfa_challenge.spend(held)
        record_security_event('mfa_enrolled', request, user=user)
        log_action(request, 'UPDATE', 'User', user.pk, 'Turned on the second factor', actor=user)
        return finish_sign_in(request, user, mfa_verified=True, extra={'recovery_codes': codes})


def _app_code_or_answer(request, why: str):
    """Check the app code in the request for the signed in admin. None when it is good, otherwise the answer to send.

    A wrong code is 422, not 401, so the website does not mistake it for an ended session. It counts toward the email's
    lockout. A recovery code is not accepted: this is the proof that the phone is still in hand.
    """
    user = request.user
    wait = lockout.is_locked(user.email)
    if wait:
        return too_many_attempts(request, user.email, wait)
    factor = SecondFactor.objects.filter(user=user, enabled_at__isnull=False).first()
    if factor is None:
        return api_error('Set up the authenticator app first.', 400)
    if not mfa.check_code(factor, request.data.get('code')):
        lockout.record_failure(user.email)
        record_security_event('mfa_failed', request, user=user, detail=why)
        log_action(request, 'OTHER', 'User', user.pk, 'Wrong second factor code', outcome='failure')
        wait = lockout.is_locked(user.email)
        return too_many_attempts(request, user.email, wait) if wait else api_error(WRONG_CODE, 422)
    lockout.clear(user.email)
    return None


class MfaStepUpView(APIView):
    """An admin proves they still hold the phone before something sensitive, without signing in again."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'second_factor'
    actions = {'post': 'step_up'}

    def post(self, request):
        """POST /api/auth/mfa/step-up: a good app code makes this sign in recent for core.mfa_guard."""
        problem = _app_code_or_answer(request, 'Asked again before a sensitive action')
        if problem:
            return problem
        UserSession.objects.filter(pk=request.session_id).update(mfa_verified_at=timezone.now())
        record_security_event('mfa_ok', request, user=request.user, detail='Asked again before a sensitive action')
        return api_success(None, 'Thank you. That code is right.')


class MfaStatusView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'second_factor'

    def get(self, request):
        """GET /api/auth/mfa: is the app on, since when, and how many recovery codes are left. Nothing secret."""
        factor = SecondFactor.objects.filter(user=request.user, enabled_at__isnull=False).first()
        return api_success({
            'enabled': factor is not None,
            'enabled_at': factor.enabled_at if factor else None,
            'recovery_codes_left': mfa.recovery_codes_left(request.user) if factor else 0,
        })


class MfaRecoveryCodesView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'second_factor'

    def post(self, request):
        """POST /api/auth/mfa/recovery-codes: a current app code replaces all eight recovery codes. They are shown once."""
        problem = _app_code_or_answer(request, 'Asked for new recovery codes')
        if problem:
            return problem
        codes = mfa.new_recovery_codes(request.user)
        record_security_event('mfa_recovery_regenerated', request, user=request.user)
        log_action(request, 'UPDATE', 'User', request.user.pk, 'Made new recovery codes for the second factor')
        return api_success({'recovery_codes': codes}, 'New recovery codes made. The old ones no longer work.')


class AdminMfaResetView(APIView):
    """Another admin resets an admin's authenticator app, for a lost phone and lost recovery codes."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'second_factor'
    actions = {'post': 'reset'}

    def post(self, request, user_id):
        """POST /api/admin/users/<id>/mfa/reset: needs the caller's own recent code, and signs the person's devices out."""
        require_recent_mfa(request)
        if user_id == request.user.pk:
            return api_error("You can't reset your own authenticator app here. Ask another admin.", 400)
        target = User.objects.filter(pk=user_id, role=Role.ADMIN).first()
        if target is None or not SecondFactor.objects.filter(user=target).exists():
            return api_error("We couldn't find an authenticator app to reset for that person.", 404)

        mfa.reset_and_sign_out(target)
        record_security_event('mfa_reset', request, user=target, detail=f'Reset by {request.user.email}')
        log_action(request, 'UPDATE', 'User', target.pk, f'Reset the second factor of {target.email}')
        try:
            send_email('Your authenticator app was reset', [target.email], Email(
                heading='Your authenticator app was reset',
                greeting=f'Hi {target.name},',
                intro=(
                    f'{request.user.name} ({request.user.email}) reset the authenticator app on your SSMS account.',
                    'You will be asked to set it up again the next time you sign in.',
                ),
                closing=('If you did not expect this, please contact the SSMS team.',),
                reason='You received this because the sign in protection on your SSMS account was changed.',
            ))
        except Exception:
            # A mail problem never undoes a reset.
            logger.exception('Could not tell %s that their authenticator app was reset', target.email)
        return api_success(None, 'Authenticator app reset. They will set it up again at their next sign in.')
