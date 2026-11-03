"""Signed in devices. One UserSession per sign in, named in its tokens by the claim `sid`.

A refresh token is used once. The next one is handed out with the answer. If that answer never arrives (weak mobile
signal), the same browser may ask again with the old token for a short while. The same token from a different browser,
or long after, means someone copied it, and the whole session ends.
"""
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from core.mail import Email, send_email_async

from .devices import DeviceInfo, describe_device
from .models import User, UserSession

logger = logging.getLogger(__name__)

REMEMBERED_TOKENS = 5
USER_AGENT_LIMIT = 300


class SessionEnded(Exception):
    """The session cannot go on. `reason` is one of revoked, expired, reused."""

    def __init__(self, reason: str, session: UserSession | None = None):
        super().__init__(reason)
        self.reason = reason
        self.session = session


def _now():
    return timezone.now()


def _agent(request) -> str:
    return request.META.get('HTTP_USER_AGENT', '')[:USER_AGENT_LIMIT]


def _blacklist(jtis) -> None:
    for outstanding in OutstandingToken.objects.filter(jti__in=list(jtis)):
        BlacklistedToken.objects.get_or_create(token=outstanding)


def _issue(session: UserSession) -> RefreshToken:
    """A new refresh token for the session. The claim is added before the access token is made, so both carry it."""
    refresh = RefreshToken.for_user(session.user)
    refresh['sid'] = session.id
    return refresh


def _remember(session: UserSession, jti: str) -> None:
    session.tokens = [*session.tokens, {'jti': jti, 'used_at': None}][-REMEMBERED_TOKENS:]


def start_session(request, user, hints=None) -> tuple[UserSession, str, str]:
    """Sign a device in. Returns the session, the access token and the refresh token."""
    now = _now()
    info = describe_device(_agent(request), hints)
    earlier = UserSession.objects.filter(user=user)
    first_ever = not earlier.exists()
    new_device = not first_ever and not earlier.filter(device_label=info.label).exists()

    session = UserSession.objects.create(
        user=user, device_label=info.label, browser=info.browser, os=info.os, is_installed_app=info.is_installed_app,
        user_agent=_agent(request), last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now),
    )
    refresh = _issue(session)
    _remember(session, refresh['jti'])
    session.save(update_fields=['tokens'])
    if new_device:
        _tell_about_new_device(user, info, now)
    return session, str(refresh.access_token), str(refresh)


def _tell_about_new_device(user, info: DeviceInfo, when) -> None:
    """A courtesy. It never carries the address, and a mail problem never stops a sign in."""
    email = Email(
        heading='New sign in to your account',
        reason='You received this because your SSMS account was used to sign in on a device we had not seen before.',
        greeting=f'Hello {user.name},',
        intro=('Your account was just used to sign in on a new device.',),
        facts=(('Device', info.label), ('Time', when.strftime('%d %b %Y, %H:%M UTC'))),
        button=('Review your devices', f'{settings.FRONTEND_URL.rstrip("/")}/settings/security'),
        closing=(
            'If this was you, there is nothing more to do.',
            'If it was not you, change your password now. That signs out every other device.',
        ),
    )
    try:
        send_email_async('New sign in to your SSMS account', [user.email], email)
    except Exception:
        logger.exception('Could not send the new device notice to %s', user.email)


def _legacy_session(request, token: RefreshToken) -> UserSession:
    """A refresh token from before sessions existed. It gets a session so nobody is signed out when this ships."""
    user = User.objects.filter(pk=token['user_id']).first()
    if user is None or not user.is_active:
        raise SessionEnded('revoked')
    now = _now()
    info = describe_device(_agent(request), None)
    return UserSession.objects.create(
        user=user, device_label=info.label, browser=info.browser, os=info.os, user_agent=_agent(request),
        last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now),
        tokens=[{'jti': token['jti'], 'used_at': None}],
    )


def _may_ask_again(request, session: UserSession, entry: dict, now) -> bool:
    within = now.timestamp() - entry['used_at'] <= settings.SESSION_REFRESH_GRACE_SECONDS
    return within and _agent(request) == session.user_agent


def rotate(request, presented: str) -> tuple[UserSession, str, str]:
    """Answer a renewal. Returns the session, a new access token and a new refresh token, or raises SessionEnded."""
    try:
        token = RefreshToken(presented)
    except TokenError:
        raise SessionEnded('revoked')
    now = _now()
    verdict = None
    with transaction.atomic():
        sid = token.payload.get('sid')
        session = UserSession.objects.select_for_update().select_related('user').filter(pk=sid).first() if sid else None
        if sid and session is None:
            raise SessionEnded('revoked')
        if session is None:
            session = _legacy_session(request, token)
        if session.revoked_at is not None or not session.user.is_active:
            verdict = 'revoked'
        elif now >= session.expires_at:
            verdict = 'expired'
        else:
            entry = next((t for t in session.tokens if t['jti'] == token['jti']), None)
            if entry is None or (entry['used_at'] is not None and not _may_ask_again(request, session, entry, now)):
                verdict = 'reused'
        if verdict is None:
            refresh = _issue(session)
            for entry in session.tokens:
                if entry['jti'] == token['jti'] and entry['used_at'] is None:
                    entry['used_at'] = now.timestamp()
            _remember(session, refresh['jti'])
            session.last_used_at = now
            session.save(update_fields=['tokens', 'last_used_at'])
    if verdict:
        if verdict == 'reused':
            revoke(session, 'reused')
        raise SessionEnded(verdict, session)
    return session, str(refresh.access_token), str(refresh)


def revoke(session: UserSession, reason: str) -> None:
    """End one device. The refresh tokens it holds go on the blacklist as a second lock."""
    if session.revoked_at is None:
        session.revoked_at = _now()
        session.revoked_reason = reason
        session.save(update_fields=['revoked_at', 'revoked_reason'])
    _blacklist(t['jti'] for t in session.tokens)


def revoke_others(user, keep_id: str | None, reason: str) -> int:
    """End every other live session of the person. Returns how many it ended."""
    count = 0
    for session in UserSession.objects.filter(user=user, revoked_at__isnull=True).exclude(pk=keep_id or ''):
        revoke(session, reason)
        count += 1
    return count


def reissue(session: UserSession) -> tuple[str, str]:
    """A new pair of tokens for a session that stays signed in, for example after a password change."""
    refresh = _issue(session)
    _remember(session, refresh['jti'])
    session.save(update_fields=['tokens'])
    return str(refresh.access_token), str(refresh)


def end_all_but(user, keep: UserSession | None, reason: str) -> int:
    """Sign every device out except `keep`. Returns how many sessions it ended.

    Refresh tokens that belong to no session (made before sessions existed) go on the blacklist too.
    """
    kept_jtis = {t['jti'] for t in keep.tokens} if keep else set()
    count = revoke_others(user, keep.pk if keep else None, reason)
    for outstanding in OutstandingToken.objects.filter(user=user).exclude(jti__in=kept_jtis):
        BlacklistedToken.objects.get_or_create(token=outstanding)
    return count
