"""Changing the login email, safely.

The person asks (with the typed current email and the password, checked by the view), a link goes to the NEW address, and the
login changes only when that link is opened. The old address is told at once and again after the change, with a link to
undo it for seven days. Opening either link needs no sign in, because the link may be opened in a browser that holds none.

A link carries a signed token with the row's id and what it is for. How long it lives is read from the row, not from the
token, so it is the database that says a link is too old.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.utils import timezone

from core.mail import Email, send_email, send_email_async
from core.sensitive import mask_email
from core.tokens import revoke_all_refresh_tokens
from logs.security import record_security_event

from .models import EmailChange

logger = logging.getLogger(__name__)

CONFIRM_FOR = timedelta(hours=24)
UNDO_FOR = timedelta(days=7)
SALT = 'users.email_change'

SAME = 'That is already your email address.'
TAKEN = 'An account with this email already exists.'
NOT_SENT = 'We could not send the link. Please try again in a minute.'
LINK_INVALID = 'This link is not valid. Please ask for a new one.'
LINK_EXPIRED = 'This link has expired. Please ask for a new one.'
LINK_USED = 'This link was already used, or is no longer needed.'
UNDO_BLOCKED = 'That address is now used by another account, so this cannot be undone here. Please contact the SSMS team.'

Status = EmailChange.Status


class EmailChangeError(Exception):
    """A refusal with a sentence, an HTTP status and a code the page tells cases apart by. `field` names the box it is about."""

    def __init__(self, message: str, status: int = 400, code: str = 'email_change_error', field: str | None = None):
        super().__init__(message)
        self.message, self.status, self.code, self.field = message, status, code, field


def make_token(change: EmailChange, purpose: str) -> str:
    """A signed token for the confirm link (`confirm`) or the undo link (`undo`)."""
    return signing.dumps({'id': change.pk, 'p': purpose}, salt=SALT)


def _read(token, purpose: str) -> EmailChange:
    try:
        data = signing.loads(str(token or ''), salt=SALT)
    except signing.BadSignature:
        raise EmailChangeError(LINK_INVALID, 400, 'link_invalid') from None
    if not isinstance(data, dict) or data.get('p') != purpose:
        raise EmailChangeError(LINK_INVALID, 400, 'link_invalid')
    change = EmailChange.objects.select_related('user').filter(pk=data.get('id')).first()
    if change is None:
        raise EmailChangeError(LINK_INVALID, 400, 'link_invalid')
    return change


def _email_taken(email: str, exclude_user_id: str | None = None) -> bool:
    """The friendly check before the database rule, which is the real guard."""
    from django.contrib.auth import get_user_model
    others = get_user_model().objects.filter(email__iexact=email)
    if exclude_user_id:
        others = others.exclude(pk=exclude_user_id)
    return others.exists()


def _link(path: str, token: str) -> str:
    return f'{settings.FRONTEND_URL.rstrip("/")}/{path}?token={token}'


def _tell(subject: str, to: str, email: Email) -> None:
    """A notice that must never stop what it is about: a failure to send it is logged and goes no further."""
    try:
        send_email_async(subject, [to], email)
    except Exception:
        logger.exception('Could not send an email change notice')


def _event(kind: str, request, user, old: str, new: str) -> None:
    if request is not None:
        record_security_event(kind, request, user=user, detail=f'{mask_email(old)} to {mask_email(new)}')


def pending_for(user) -> EmailChange | None:
    """The change the person has asked for and not yet confirmed, unless its link has run out."""
    return EmailChange.objects.filter(user=user, status=Status.PENDING, created_at__gt=timezone.now() - CONFIRM_FOR).first()


def start(user, new_email: str, request=None) -> EmailChange:
    """Ask to change the email. Nothing changes yet: a link goes to the new address, and the old address is told."""
    new = str(new_email or '').strip().lower()
    old = user.email
    if new == old.lower():
        raise EmailChangeError(SAME, 422, 'email_same', 'new_email')
    if _email_taken(new, user.pk):
        raise EmailChangeError(TAKEN, 422, 'email_taken', 'new_email')
    with transaction.atomic():
        EmailChange.objects.filter(user=user, status=Status.PENDING).update(status=Status.CANCELLED)
        change = EmailChange.objects.create(user=user, old_email=old, new_email=new)
        try:
            send_email(
                'Confirm your new SSMS email address',
                [new],
                Email(
                    heading='Confirm your new email address',
                    greeting=f'Hi {user.name},',
                    intro=(f'You asked to use this address for your SSMS account instead of {mask_email(old)}.',),
                    button=('Confirm this address', _link('confirm-email-change', make_token(change, 'confirm'))),
                    closing=('The link works for 24 hours. If you did not ask for this, you can ignore this email: nothing changes.',),
                    reason='You received this because this address was given for an SSMS account.',
                ),
            )
        except Exception as exc:
            logger.exception('Could not send the email change link')
            raise EmailChangeError(NOT_SENT, 422, 'email_not_sent') from exc
    _tell(
        'Someone asked to change your SSMS email address', old,
        Email(
            heading='A change of email address was asked for',
            greeting=f'Hi {user.name},',
            intro=(
                f'A request was made to change the email of your SSMS account to {mask_email(new)}.',
                'Nothing changes until the link that was sent to that address is opened.',
            ),
            closing=('If this was not you, change your password in Settings, Security.',),
            reason='You received this because a change of email was asked for on your SSMS account.',
        ),
    )
    _event('email_change_asked', request, user, old, new)
    return change


def confirm(token, request=None) -> EmailChange:
    """Open the link sent to the new address. The login changes, every device is signed out, and the old address gets an undo link."""
    change = _read(token, 'confirm')
    if change.status != Status.PENDING:
        raise EmailChangeError(LINK_USED, 400, 'link_used')
    if timezone.now() - change.created_at > CONFIRM_FOR:
        raise EmailChangeError(LINK_EXPIRED, 400, 'link_expired')
    user = change.user
    if _email_taken(change.new_email, user.pk):
        raise EmailChangeError(TAKEN, 422, 'email_taken')
    try:
        with transaction.atomic():
            locked = EmailChange.objects.select_for_update().get(pk=change.pk)
            if locked.status != Status.PENDING:
                raise EmailChangeError(LINK_USED, 400, 'link_used')
            user.email = locked.new_email
            user.save(update_fields=['email'])
            locked.status = Status.DONE
            locked.confirmed_at = timezone.now()
            locked.save(update_fields=['status', 'confirmed_at'])
    except IntegrityError:
        # Another account took the address in the same moment.
        raise EmailChangeError(TAKEN, 422, 'email_taken') from None
    change = locked
    revoke_all_refresh_tokens(user, 'email_changed')
    _tell(
        'Your SSMS email address was changed', change.old_email,
        Email(
            heading='Your email address was changed',
            greeting=f'Hi {user.name},',
            intro=(f'The email of your SSMS account was changed to {mask_email(change.new_email)}.',),
            button=('This was not me, undo it', _link('undo-email-change', make_token(change, 'undo'))),
            closing=('The link works for 7 days. Undoing it signs every device out and sends you a link to choose a new password.',),
            reason='You received this because the email of your SSMS account was changed.',
        ),
    )
    _event('email_changed', request, user, change.old_email, change.new_email)
    return change


def undo(token, request=None) -> EmailChange:
    """Open the undo link sent to the old address. The old email comes back and a password reset link follows, because whoever changed it knew the password."""
    change = _read(token, 'undo')
    if change.status != Status.DONE:
        raise EmailChangeError(LINK_USED, 400, 'link_used')
    if change.confirmed_at is None or timezone.now() - change.confirmed_at > UNDO_FOR:
        raise EmailChangeError(LINK_EXPIRED, 400, 'link_expired')
    user = change.user
    if _email_taken(change.old_email, user.pk):
        raise EmailChangeError(UNDO_BLOCKED, 422, 'undo_blocked')
    try:
        with transaction.atomic():
            locked = EmailChange.objects.select_for_update().get(pk=change.pk)
            if locked.status != Status.DONE:
                raise EmailChangeError(LINK_USED, 400, 'link_used')
            user.email = locked.old_email
            user.save(update_fields=['email'])
            locked.status = Status.UNDONE
            locked.save(update_fields=['status'])
    except IntegrityError:
        raise EmailChangeError(UNDO_BLOCKED, 422, 'undo_blocked') from None
    change = locked
    revoke_all_refresh_tokens(user, 'email_change_undone')
    try:
        from .password_reset_views import _send_reset_email
        _send_reset_email(user)
    except Exception:
        logger.exception('Could not send the password reset link after an undo')
    _event('email_change_undone', request, user, change.new_email, change.old_email)
    return change


def cancel(user) -> bool:
    """Take back a request that has not been confirmed. False when there was nothing to take back."""
    return EmailChange.objects.filter(user=user, status=Status.PENDING).update(status=Status.CANCELLED) > 0
