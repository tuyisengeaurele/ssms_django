import logging

from core.net import get_client_ip
from core.request_id import current_request_id

from .models import SecurityEvent

logger = logging.getLogger(__name__)

DETAIL_LIMIT = 300

# Every kind of event and the plain words for it. A kind that is not here does not get written.
KINDS = {
    'login_ok': 'Signed in',
    'login_failed': 'Sign in failed',
    'lockout': 'Account locked for a while',
    'password_changed': 'Password changed',
    'reset_requested': 'Password reset asked for',
    'new_device': 'Signed in on a new device',
    'session_revoked': 'Device signed out',
    'session_reused': 'Old sign in cookie used again',
    'session_idle': 'Sign in ended for sitting idle',
    'mfa_enrolled': 'Authenticator app turned on',
    'mfa_ok': 'Signed in with a code',
    'mfa_failed': 'Wrong code at sign in',
    'mfa_recovery_used': 'Signed in with a recovery code',
    'mfa_recovery_regenerated': 'New recovery codes made',
    'mfa_reset': 'Authenticator app reset',
    'support_requested': 'Support access asked for',
    'support_allowed': 'Support access allowed',
    'support_rejected': 'Support access refused by the person',
    'support_started': 'Support access started',
    'support_ended': 'Support access ended',
    'support_expired': 'Support access request ran out of time',
    'support_refused': 'Action refused during support access',
    'permission_denied': 'Refused for the role',
    'throttled': 'Slowed down',
    'csp_violation': 'Browser blocked something the page tried to load',
}


def record_security_event(kind: str, request, user=None, detail: str = '') -> None:
    """Write one security event. A problem writing it is logged and never reaches the request it describes."""
    try:
        if kind not in KINDS:
            raise ValueError(f'unknown security event kind: {kind}')
        acting = getattr(request, 'acting_admin', None) if user is None else None
        if acting is not None:
            # An admin acting as a person. The event is the admin's, and says whose account it was.
            person = getattr(request, 'user', None)
            detail = f'as {getattr(person, "email", "")}: {detail}'
        who = user or acting or getattr(request, 'user', None)
        known = who is not None and getattr(who, 'is_authenticated', False)
        SecurityEvent.objects.create(
            kind=kind,
            user_id=who.pk if known else None,
            user_email=who.email if known else '',
            ip_address=get_client_ip(request),
            request_id=getattr(request, 'request_id', '') or current_request_id(),
            detail=(detail or '')[:DETAIL_LIMIT],
        )
    except Exception:
        logger.exception('Could not write the security event %s', kind)
