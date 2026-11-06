"""The life of a support request. This is the only code that changes a status.

A status change is one UPDATE that names the status it expects, so two callers racing for the same row cannot both win.
Time limits are worked out when somebody reads the row (`settle`), so there is no job to keep running.
"""
import logging
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from logs.models import SecurityEvent
from users.models import Role, UserSession

from .models import MINUTES, MODES, REASON_MAX, REASON_MIN, REQUEST_WAIT, START_WINDOW, SupportAccess

logger = logging.getLogger(__name__)
Status = SupportAccess.Status

# Who a visit may be for. Never an admin account.
TARGET_ROLES = (Role.FARMER, Role.SUPERVISOR)
DEVICE_LABEL = 'SSMS support'


class SupportError(Exception):
    """Something the caller did cannot be done. `message` is for the person, `code` for the page."""

    def __init__(self, message: str, status: int = 400, code: str = 'support_error'):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def _now():
    return timezone.now()


def _note(kind: str, access: SupportAccess, detail: str) -> None:
    """Write a security event for a change that no request caused (time ran out, a person was deactivated).

    Changes that a person or an admin asked for are written by the view that handled the request, with its reference.
    """
    try:
        SecurityEvent.objects.create(kind=kind, user_id=access.admin_id, user_email=access.admin_email, detail=detail[:300])
    except Exception:
        logger.exception('Could not write the security event %s', kind)


def _move(access: SupportAccess, expected, to, **fields) -> bool:
    """Change the status only if it still is `expected`. False means somebody else got there first."""
    changed = SupportAccess.objects.filter(pk=access.pk, status=expected).update(status=to, **fields)
    access.refresh_from_db()
    return changed == 1


def open_request_of(person) -> SupportAccess | None:
    return SupportAccess.objects.filter(person=person, status__in=SupportAccess.OPEN).first()


def _open_request_of_admin(admin) -> SupportAccess | None:
    return SupportAccess.objects.filter(admin=admin, status__in=SupportAccess.OPEN).first()


def settle(access: SupportAccess) -> SupportAccess:
    """Apply the time limits to the row, and give it back as it now is."""
    now = _now()
    if access.status == Status.REQUESTED and now - access.requested_at >= REQUEST_WAIT:
        if _move(access, Status.REQUESTED, Status.EXPIRED):
            _note('support_expired', access, f'Nobody answered for {access.person_email}')
    elif access.status == Status.APPROVED and now - access.decided_at >= START_WINDOW:
        if _move(access, Status.APPROVED, Status.EXPIRED):
            _note('support_expired', access, f'Allowed by {access.person_email} but never started')
    elif access.status == Status.ACTIVE and now >= access.ends_at:
        end_support_access(access, 'time', 'time_up')
    return access


def _check_input(reason: str, minutes: int, mode: str) -> str:
    reason = (reason or '').strip()
    if not REASON_MIN <= len(reason) <= REASON_MAX:
        raise SupportError(f'Please give a reason of {REASON_MIN} to {REASON_MAX} characters.', 400, 'invalid_reason')
    if minutes not in MINUTES:
        raise SupportError('Choose 15, 30 or 60 minutes.', 400, 'invalid_length')
    if mode not in MODES:
        raise SupportError('Choose view only, or ask to make changes as well.', 400, 'invalid_mode')
    return reason


def ask(admin, person, *, reason: str, minutes: int, mode: str) -> SupportAccess:
    if person.pk == admin.pk or person.role not in TARGET_ROLES or not person.is_active:
        raise SupportError('Support access can only be asked of a farmer or a supervisor with an active account.', 400, 'target_not_allowed')
    reason = _check_input(reason, minutes, mode)

    # A request that ran out of time must not block a new one just because nobody read it yet.
    for old in (_open_request_of_admin(admin), open_request_of(person)):
        if old is not None:
            settle(old)
    if _open_request_of_admin(admin) is not None:
        raise SupportError('You already have an open support request.', 409, 'admin_busy')
    if open_request_of(person) is not None:
        raise SupportError('That person already has an open support request.', 409, 'person_busy')

    try:
        with transaction.atomic():
            return SupportAccess.objects.create(
                admin=admin, person=person, admin_email=admin.email, admin_name=admin.name,
                person_email=person.email, person_name=person.name,
                reason=reason, minutes=minutes, requested_mode=mode,
            )
    except IntegrityError as error:
        # Two requests raced and the database let one through. The constraint's name says which rule it was.
        if 'support_one_open_per_admin' in str(error):
            raise SupportError('You already have an open support request.', 409, 'admin_busy') from error
        raise SupportError('That person already has an open support request.', 409, 'person_busy') from error


def respond(access: SupportAccess, person, *, allow: bool, allow_edit: bool) -> SupportAccess:
    if access.person_id != person.pk:
        raise SupportError('We could not find that request.', 404, 'not_found')
    settle(access)
    if access.status == Status.EXPIRED:
        raise SupportError('That request has run out of time.', 409, 'expired')
    if access.status != Status.REQUESTED:
        raise SupportError('That request was already answered.', 409, 'already_answered')
    if allow:
        # The person may grant less than was asked, never more.
        granted = 'edit' if access.requested_mode == 'edit' and allow_edit else 'view'
        moved = _move(access, Status.REQUESTED, Status.APPROVED, decided_at=_now(), granted_mode=granted)
    else:
        moved = _move(access, Status.REQUESTED, Status.REJECTED, decided_at=_now())
    if not moved:
        raise SupportError('That request was already answered.', 409, 'already_answered')
    return access


def _own(access: SupportAccess, admin) -> None:
    if access.admin_id != admin.pk:
        raise SupportError('That is not your request.', 403, 'not_allowed')


def cancel(access: SupportAccess, admin) -> SupportAccess:
    _own(access, admin)
    settle(access)
    for status in (Status.REQUESTED, Status.APPROVED):
        if access.status == status and _move(access, status, Status.CANCELLED, ended_at=_now(), ended_by='admin', ended_reason='cancelled'):
            return access
    raise SupportError('That request can no longer be withdrawn.', 409, 'not_cancellable')


def _token(access: SupportAccess, session: UserSession) -> str:
    """An access token for the person, marked with this visit and the admin. It lives for the time left and no longer."""
    left = access.ends_at - _now()
    if left <= timedelta(0):
        raise SupportError('That support session has ended.', 409, 'not_active')
    token = AccessToken.for_user(access.person)
    token['sid'] = session.id
    token['act'] = access.admin_id
    token.set_exp(lifetime=left)
    return str(token)


def start(access: SupportAccess, admin, admin_session_id: str) -> str:
    """Begin the visit. Returns the access token for the person's sign in made for it."""
    _own(access, admin)
    settle(access)
    if access.status != Status.APPROVED:
        raise SupportError('That request is not waiting to be started.', 409, 'not_approved')
    person = access.person
    if person is None or not person.is_active or person.role not in TARGET_ROLES:
        raise SupportError('That person can no longer be viewed.', 409, 'target_not_allowed')
    now = _now()
    if not UserSession.objects.filter(pk=admin_session_id, user=admin, revoked_at__isnull=True, expires_at__gt=now).exists():
        raise SupportError('Please sign in again.', 403, 'admin_session_missing')

    ends_at = now + timedelta(minutes=access.minutes)
    with transaction.atomic():
        if not _move(access, Status.APPROVED, Status.ACTIVE, started_at=now, ends_at=ends_at, admin_session_id=admin_session_id):
            raise SupportError('That request is not waiting to be started.', 409, 'not_approved')
        session = UserSession.objects.create(
            user=person, device_label=DEVICE_LABEL, last_used_at=now, last_activity_at=now, expires_at=ends_at, support_access=access,
        )
    return _token(access, session)


def reissue_token(access: SupportAccess, admin) -> str:
    """A new token for a visit that is running, for an admin whose page lost the old one (a reload)."""
    _own(access, admin)
    settle(access)
    if access.status != Status.ACTIVE:
        raise SupportError('That support session is not running.', 409, 'not_active')
    session = access.support_sessions.filter(revoked_at__isnull=True).first()
    if session is None:
        raise SupportError('That support session is not running.', 409, 'not_active')
    return _token(access, session)


def end_support_access(access: SupportAccess, by: str, reason: str) -> bool:
    """End a visit for any reason, whether or not it started. True when this call ended it, False when it was over already."""
    now = _now()
    changed = SupportAccess.objects.filter(pk=access.pk, status__in=SupportAccess.OPEN).update(
        status=Status.ENDED, ended_at=now, ended_by=by, ended_reason=reason[:40],
    )
    # Always close the sign in, even when the row was already over, so none is left open by a half finished earlier call.
    UserSession.objects.filter(support_access_id=access.pk, revoked_at__isnull=True).update(revoked_at=now, revoked_reason='support')
    access.refresh_from_db()
    if changed == 1 and by in ('time', 'system'):
        _note('support_ended', access, f'Ended by {by} ({reason}), visit to {access.person_email}')
    return changed == 1
