"""A farmer or supervisor asks to move to another cooperative, or to leave theirs, and the SSMS team decides.

This is the only code that changes a request. Approving moves the person the way the admin route does (`user.cooperative` is
set and saved, which keeps the membership history), cancels a farmer's open egg requests in the cooperative they leave, and
gives a farmer the starting allowance of the cooperative they join, all in one transaction: a refusal leaves everything as it
was, and the request open, so it can still be declined.
"""
import logging

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from core.mail import Email, send_email_async
from users.models import Role, User

from .models import Cooperative, CooperativeChangeRequest

logger = logging.getLogger(__name__)

Status = CooperativeChangeRequest.Status
REASON_MAX = 500
MOVED_NOTE = 'Cancelled because you moved to another cooperative.'

REQUEST_OPEN = 'You already have a request waiting. Withdraw it first to ask again.'
REQUEST_SAME = 'Your cooperative would stay the same.'
REASON_REQUIRED = f'Please say why, in 1 to {REASON_MAX} characters.'
NOTE_REQUIRED = 'Please say why, so the person knows what to change.'
ALREADY_DECIDED = 'This request was already decided.'
PERSON_INACTIVE = 'This account is not active, so it cannot be moved.'
COOPERATIVE_INACTIVE = 'That cooperative is no longer active.'
ALREADY_MOVED = 'This person is no longer in the cooperative they asked to leave.'
NOTHING_TO_WITHDRAW = 'There is no request to withdraw.'


class ChangeRequestError(Exception):
    """A refusal with a sentence, an HTTP status and a code the page tells cases apart by."""

    def __init__(self, message: str, status: int = 400, code: str = 'coop_request_error'):
        super().__init__(message)
        self.message, self.status, self.code = message, status, code


def _reason(text) -> str:
    text = str(text or '').strip()
    if not 1 <= len(text) <= REASON_MAX:
        raise ChangeRequestError(REASON_REQUIRED, 422, 'coop_reason_required')
    return text


def open_for(user) -> CooperativeChangeRequest | None:
    return CooperativeChangeRequest.objects.filter(user=user, status=Status.REQUESTED).select_related('from_cooperative', 'to_cooperative').first()


def ask(user, to_cooperative_id: str | None, reason) -> CooperativeChangeRequest:
    """Ask to move to the cooperative with this id, or to leave when it is empty. Only farmers and supervisors belong to one."""
    reason = _reason(reason)
    target = None
    if to_cooperative_id:
        target = Cooperative.objects.filter(pk=to_cooperative_id, is_active=True).first()
        if target is None:
            raise ChangeRequestError('We could not find that cooperative.', 404, 'not_found')
    if (target.pk if target else None) == user.cooperative_id:
        raise ChangeRequestError(REQUEST_SAME, 422, 'coop_request_same')
    if open_for(user) is not None:
        raise ChangeRequestError(REQUEST_OPEN, 409, 'coop_request_open')
    try:
        with transaction.atomic():
            row = CooperativeChangeRequest.objects.create(
                user=user, from_cooperative_id=user.cooperative_id, to_cooperative=target, reason=reason,
            )
    except IntegrityError:
        # Two taps at once: the database kept one.
        raise ChangeRequestError(REQUEST_OPEN, 409, 'coop_request_open') from None
    tell_team(row)
    return row


def withdraw(request: CooperativeChangeRequest, user) -> None:
    if request.user_id != user.pk:
        raise ChangeRequestError('We could not find that request.', 404, 'not_found')
    changed = CooperativeChangeRequest.objects.filter(pk=request.pk, status=Status.REQUESTED).update(status=Status.WITHDRAWN, decided_at=timezone.now())
    if not changed:
        raise ChangeRequestError(NOTHING_TO_WITHDRAW, 404, 'coop_nothing_to_withdraw')


def withdraw_open(user) -> int:
    """Take back the person's open request, if any. Closing an account does this. Returns how many were taken back."""
    return CooperativeChangeRequest.objects.filter(user=user, status=Status.REQUESTED).update(status=Status.WITHDRAWN, decided_at=timezone.now())


def decide(request: CooperativeChangeRequest, admin, decision: str, note: str = '') -> CooperativeChangeRequest:
    """Approve or decline. Only an open request can be decided, and a note is needed to decline."""
    if decision not in ('approve', 'decline'):
        raise ChangeRequestError('Please approve or decline.', 400, 'coop_bad_decision')
    note = str(note or '').strip()[:REASON_MAX]
    if decision == 'decline' and not note:
        raise ChangeRequestError(NOTE_REQUIRED, 422, 'coop_note_required')
    with transaction.atomic():
        changed = CooperativeChangeRequest.objects.filter(pk=request.pk, status=Status.REQUESTED).update(
            status=Status.APPROVED if decision == 'approve' else Status.DECLINED, decision_note=note, decided_by=admin, decided_at=timezone.now(),
        )
        if not changed:
            raise ChangeRequestError(ALREADY_DECIDED, 409, 'coop_already_decided')
        if decision == 'approve':
            # An error here rolls the decision back too, so the request stays open and can still be declined.
            _move(CooperativeChangeRequest.objects.select_related('to_cooperative').get(pk=request.pk), admin)
    request.refresh_from_db()
    tell_person(request)
    return request


def _move(request: CooperativeChangeRequest, admin) -> None:
    person = User.objects.select_for_update().get(pk=request.user_id)
    target = request.to_cooperative
    if not person.is_active or person.role == Role.ADMIN:
        raise ChangeRequestError(PERSON_INACTIVE, 409, 'coop_person_inactive')
    if target is not None and not target.is_active:
        raise ChangeRequestError(COOPERATIVE_INACTIVE, 409, 'coop_cooperative_inactive')
    if person.cooperative_id != request.from_cooperative_id:
        raise ChangeRequestError(ALREADY_MOVED, 409, 'coop_already_moved')
    old_id = person.cooperative_id
    person.cooperative = target
    person.save(update_fields=['cooperative'])
    if person.role != Role.FARMER:
        return
    if old_id:
        _let_go_of_the_old_cooperative(person, old_id)
    if target is not None:
        from supply import allowance
        from supply.models import SupplySettings
        allowance.set_start(person, target, SupplySettings.for_cooperative(target).starter_boxes, by=admin)


def _let_go_of_the_old_cooperative(farmer, old_cooperative_id: str) -> None:
    """The rounds and the allowance the farmer asked for belong to the cooperative they leave, so they do not follow them."""
    from supply import rounds
    from supply.models import AllowanceRequest, EggRequest

    Req = EggRequest.Status
    open_ones = EggRequest.objects.filter(
        farmer=farmer, round__cooperative_id=old_cooperative_id, status__in=[Req.SUBMITTED, Req.APPROVED, Req.PART_APPROVED, Req.WAITLISTED],
    )
    for egg_request in open_ones:
        rounds.cancel_request(egg_request, farmer)
        EggRequest.objects.filter(pk=egg_request.pk).update(decision_note=MOVED_NOTE)
    AllowanceRequest.objects.filter(farmer=farmer, status=AllowanceRequest.Status.REQUESTED).update(
        status=AllowanceRequest.Status.WITHDRAWN, decided_at=timezone.now(),
    )


# ── the mail ──────────────────────────────────────────────────────────────────────────────────

def _name(cooperative) -> str:
    return cooperative.name if cooperative else 'No cooperative'


def _send(subject: str, to: str, email: Email) -> None:
    """The request is already saved and the person sees it in the app, so a mail that cannot be sent is logged and goes no further."""
    try:
        send_email_async(subject, [to], email)
    except Exception:
        logger.exception('Could not send the cooperative request mail "%s"', subject)


def _link(page: str) -> str:
    return f'{settings.FRONTEND_URL.rstrip("/")}/{page}'


def tell_team(row: CooperativeChangeRequest) -> None:
    """Every active admin hears that a request waits. Each gets a mail of their own."""
    person = row.user
    subject = 'A cooperative change waits for your decision'
    facts = (('Person', person.name), ('From', _name(row.from_cooperative)), ('To', _name(row.to_cooperative)), ('Reason', row.reason))
    for admin in User.objects.filter(role=Role.ADMIN, is_active=True):
        _send(subject, admin.email, Email(
            heading=subject,
            reason='You received this because you can decide about cooperative changes.',
            greeting=f'Hello {admin.name},',
            intro=(f'{person.name} has asked to change cooperative.',),
            facts=facts,
            button=('Open the requests', _link('admin/requests')),
        ))


def tell_person(row: CooperativeChangeRequest) -> None:
    """The person hears the answer, with the note quoted."""
    approved = row.status == Status.APPROVED
    subject = 'Your cooperative change request'
    if approved:
        where = f'You are now in {row.to_cooperative.name}.' if row.to_cooperative else 'You are no longer in a cooperative.'
        intro = (f'The SSMS team approved your request. {where}',)
    else:
        intro = (f'The SSMS team did not approve your request. You stay in {_name(row.from_cooperative)}.' if row.from_cooperative
                 else 'The SSMS team did not approve your request.',)
    facts = [('From', _name(row.from_cooperative)), ('To', _name(row.to_cooperative))]
    if row.decision_note:
        facts.append(('Note' if approved else 'Reason', row.decision_note))
    _send(subject, row.user.email, Email(
        heading=subject,
        reason='You received this because the SSMS team answered your cooperative change request.',
        greeting=f'Hello {row.user.name},',
        intro=intro,
        facts=tuple(facts),
        button=('Open SSMS', _link('app')),
    ))
