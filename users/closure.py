"""A farmer closes their own account, and a nightly job removes what says who they were.

Asking schedules the removal `ACCOUNT_DELETION_GRACE_DAYS` days on. Until then the account reaches nothing but its closure
screen (`core/account_gate.py`) and the farmer can take it back with one click. Asking also signs every other device out and
takes back what the farmer had open: egg requests, a cooperative request, an allowance request and an email change.

Anonymising keeps what the person did and removes who they were. Farms, rooms, batches and harvests stay, as history without a
name, because the other people's figures are made of them. The email and the number are freed for anyone to use again.
"""
import logging
from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone

from core.mail import Email, send_email_async
from logs.security import record_security_event

from . import email_change
from .models import EmailChange, NotificationPreference, RecoveryCode, Role, SecondFactor, User, UserSession

logger = logging.getLogger(__name__)

NOT_FOR_STAFF = 'To close your account, please contact the SSMS team.'
NOTHING_TO_CANCEL = 'Your account is not scheduled to be removed.'
CLOSED_NOTE = 'Cancelled because you closed your account.'
FORMER_NAME = 'Former member'


class ClosureError(Exception):
    """A refusal with a sentence, an HTTP status and a code the page tells cases apart by."""

    def __init__(self, message: str, status: int = 400, code: str = 'closure_error'):
        super().__init__(message)
        self.message, self.status, self.code = message, status, code


def removal_date(user) -> datetime | None:
    """When the account is removed, or None when no closure is scheduled."""
    if user.deletion_requested_at is None:
        return None
    return user.deletion_requested_at + timedelta(days=settings.ACCOUNT_DELETION_GRACE_DAYS)


def spoken(when: datetime) -> str:
    """A date a person reads in an email: 24 December 2026."""
    return f'{when.day} {when:%B %Y}'


def _event(kind: str, user, request=None, detail: str = '') -> None:
    # The nightly job has no request, so it is given an empty one: the event is then written without an address.
    record_security_event(kind, request if request is not None else HttpRequest(), user=user, detail=detail)


# ── asking and taking it back ────────────────────────────────────────────────────────────────

def request_closure(user, request=None) -> User:
    """Schedule the removal. Asking again keeps the first date."""
    if user.role != Role.FARMER:
        raise ClosureError(NOT_FOR_STAFF, 403, 'deletion_not_for_staff')
    if user.deletion_requested_at is not None:
        return user
    with transaction.atomic():
        changed = User.objects.filter(pk=user.pk, deletion_requested_at__isnull=True).update(deletion_requested_at=timezone.now())
        if not changed:
            user.refresh_from_db()   # somebody asked in the same moment, and that date stands
            return user
        user.refresh_from_db()
        _let_go_of_what_is_open(user)
        _end_the_other_sessions(user, request)
    _tell_the_date(user)
    _event('deletion_scheduled', user, request, f'Removal on {removal_date(user).date().isoformat()}')
    return user


def cancel_closure(user, request=None) -> User:
    """The farmer keeps the account. The sessions that were ended stay ended, and the screen they kept opens the app again."""
    changed = User.objects.filter(pk=user.pk, deletion_requested_at__isnull=False, anonymised_at__isnull=True).update(deletion_requested_at=None)
    if not changed:
        raise ClosureError(NOTHING_TO_CANCEL, 404, 'deletion_nothing_to_cancel')
    user.refresh_from_db()
    _event('deletion_cancelled', user, request)
    return user


def _let_go_of_what_is_open(farmer) -> None:
    """Egg requests, a cooperative request, an allowance request and an email change are taken back, so none of them is
    decided or confirmed for an account that is going away."""
    from cooperatives.change_requests import withdraw_open
    from supply import rounds
    from supply.models import AllowanceRequest, EggRequest

    Req = EggRequest.Status
    for egg_request in EggRequest.objects.filter(farmer=farmer, status__in=[Req.SUBMITTED, Req.APPROVED, Req.PART_APPROVED, Req.WAITLISTED]):
        rounds.cancel_request(egg_request, farmer)
        EggRequest.objects.filter(pk=egg_request.pk).update(decision_note=CLOSED_NOTE)
    AllowanceRequest.objects.filter(farmer=farmer, status=AllowanceRequest.Status.REQUESTED).update(
        status=AllowanceRequest.Status.WITHDRAWN, decided_at=timezone.now(),
    )
    withdraw_open(farmer)
    email_change.cancel(farmer)


def _end_the_other_sessions(user, request) -> None:
    """Every device but this one is signed out. This one stays, because its screen is the way back."""
    from .sessions import end_all_but

    session_id = getattr(request, 'session_id', None)
    kept = UserSession.objects.filter(pk=session_id, user=user, revoked_at__isnull=True).first() if session_id else None
    end_all_but(user, kept, 'deletion_scheduled')


def _tell_the_date(user) -> None:
    """The farmer already sees the date on screen, so a mail that cannot be sent is logged and goes no further."""
    when = spoken(removal_date(user))
    try:
        send_email_async(
            f'Your SSMS account will be removed on {when}',
            [user.email],
            Email(
                heading='Your account will be removed',
                greeting=f'Hi {user.name},',
                intro=(
                    f'You asked to close your SSMS account. It will be removed on {when}.',
                    'Your farms and batches stay as history, without your name. Your open egg requests were cancelled.',
                ),
                button=('Keep my account', f'{settings.FRONTEND_URL.rstrip("/")}/login'),
                closing=(f'Until {when} you can sign in and choose Keep my account. Nothing is removed before then.',),
                reason='You received this because the closing of your SSMS account was asked for.',
            ),
        )
    except Exception:
        logger.exception('Could not send the account closure mail')


# ── the nightly removal ──────────────────────────────────────────────────────────────────────

def due_accounts(now=None):
    """The accounts whose grace days are over and that were not taken back, the one waiting longest first."""
    now = now or timezone.now()
    return User.objects.filter(
        deletion_requested_at__lte=now - timedelta(days=settings.ACCOUNT_DELETION_GRACE_DAYS), anonymised_at__isnull=True,
    ).order_by('deletion_requested_at', 'pk')


def anonymise(user, request=None) -> User:
    """Remove what says who the person was. Safe to run again: an account that is done is returned as it is."""
    from sensors.models import IoTDevice

    with transaction.atomic():
        person = User.objects.select_for_update().get(pk=user.pk)
        if person.anonymised_at is not None:
            return person
        _let_go_of_what_is_open(person)
        person.name = FORMER_NAME
        # The placeholder holds the id, so any number of these can exist side by side, and the real address is free again.
        person.email = f'deleted-{person.pk}@deleted.invalid'
        person.set_unusable_password()
        person.phone = None
        person.phone_verified_at = None
        person.photo_url = None
        person.preferred_language = 'en'
        person.is_active = False
        person.is_email_verified = False
        person.terms_accepted_at = None
        person.mfa_prompt_snoozed_until = None
        person.mfa_prompt_dismissals = 0
        person.mfa_prompted_at = None
        person.cooperative = None   # a save that writes the cooperative closes the membership too
        person.anonymised_at = timezone.now()
        person.save()
        UserSession.objects.filter(user=person).delete()
        RecoveryCode.objects.filter(user=person).delete()
        SecondFactor.objects.filter(user=person).delete()
        NotificationPreference.objects.filter(user=person).delete()
        EmailChange.objects.filter(user=person).delete()
        _forget_the_tokens(person)
        IoTDevice.objects.filter(farm__owner=person).update(is_active=False)
    _event('account_anonymised', person, request)
    return person


def _forget_the_tokens(person) -> None:
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

    OutstandingToken.objects.filter(user=person).delete()
