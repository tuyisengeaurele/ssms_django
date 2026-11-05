"""Ask for a recent code from the authenticator app before something sensitive.

The sign in already checked a code, and the session remembers when (`mfa_verified_at`). An action that should not rest
on a sign in from this morning calls `require_recent_mfa` first. The page then asks for a fresh code at
POST /api/auth/mfa/step-up and tries the action again.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from users.models import UserSession

RECENT_MINUTES = 10
MESSAGE = 'Please confirm with a code from your authenticator app.'


def require_recent_mfa(request, minutes: int = RECENT_MINUTES) -> None:
    """Raise a 403 coded `mfa_recent_required` unless a code was checked in this session within `minutes`."""
    session_id = getattr(request, 'session_id', None)
    verified = UserSession.objects.filter(pk=session_id).values_list('mfa_verified_at', flat=True).first() if session_id else None
    if verified is None or timezone.now() - verified > timedelta(minutes=minutes):
        raise PermissionDenied(MESSAGE, code='mfa_recent_required')
