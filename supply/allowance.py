"""The rules of an allowance. This is the only code that changes one.

An allowance is a whole number of boxes. A farmer who has none written yet has the cooperative's default, and the first
change writes that default into the history before the change, so the history always starts with the amount the farmer
really had. A decision is one conditional UPDATE, so two supervisors deciding the same request cannot both win.
"""
from django.db import IntegrityError, transaction
from django.utils import timezone

from users.models import User

from .models import ALLOWANCE_MAX, ALLOWANCE_MIN, Allowance, AllowanceChange, AllowanceRequest, SupplySettings

Kind = AllowanceChange.Kind
Status = AllowanceRequest.Status
REASON_MIN = 10
REASON_MAX = 500
NOT_IN_COOPERATIVE = 'This farmer is not part of a cooperative.'


class AllowanceError(Exception):
    """Something cannot be done. `message` is for the person, `code` for the page."""

    def __init__(self, message: str, status: int = 400, code: str = 'allowance_error'):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def valid_boxes(value) -> int:
    """A whole number from 0 to 100. A bool, a fraction and text are refused, because 2.5 boxes is not a thing."""
    ok = isinstance(value, int) and not isinstance(value, bool) and ALLOWANCE_MIN <= value <= ALLOWANCE_MAX
    if not ok:
        raise AllowanceError(f'Please enter a whole number of boxes from {ALLOWANCE_MIN} to {ALLOWANCE_MAX}.', 422, 'bad_boxes')
    return value


def _reason(text) -> str:
    text = str(text or '').strip()
    if not REASON_MIN <= len(text) <= REASON_MAX:
        raise AllowanceError(f'Please say why, in {REASON_MIN} to {REASON_MAX} characters.', 422, 'reason_needed')
    return text


def _valid_row(farmer):
    """The farmer's row, only while it was set in the cooperative they are in now."""
    if not farmer.cooperative_id:
        return None
    return Allowance.objects.filter(farmer=farmer, cooperative_id=farmer.cooperative_id).first()


def current(farmer) -> dict:
    """What the farmer may take now: `boxes`, where it comes from (`set`, `default` or `none`) and since when."""
    if not farmer.cooperative_id:
        return {'boxes': 0, 'source': 'none', 'since': None}
    row = _valid_row(farmer)
    if row is not None:
        return {'boxes': row.boxes, 'source': 'set', 'since': row.since}
    return {'boxes': SupplySettings.for_cooperative(farmer.cooperative).starter_boxes, 'source': 'default', 'since': None}


def for_farmers(farmers, cooperative) -> dict:
    """`boxes` and `source` for many farmers of one cooperative, in two queries, for a list."""
    default = SupplySettings.for_cooperative(cooperative).starter_boxes
    rows = {r.farmer_id: r.boxes for r in Allowance.objects.filter(cooperative=cooperative, farmer__in=list(farmers))}
    return {f.pk: ({'boxes': rows[f.pk], 'source': 'set'} if f.pk in rows else {'boxes': default, 'source': 'default'}) for f in farmers}


def set_start(farmer, cooperative, boxes, by) -> Allowance:
    """Write the amount a farmer starts with. It replaces a row left over from another cooperative."""
    boxes = valid_boxes(boxes)
    with transaction.atomic():
        row, _ = Allowance.objects.update_or_create(farmer=farmer, defaults={'cooperative': cooperative, 'boxes': boxes})
        AllowanceChange.objects.create(
            farmer=farmer, cooperative=cooperative, old_boxes=None, new_boxes=boxes, kind=Kind.START, decided_by=by,
        )
    return row


def _materialise(farmer) -> Allowance:
    """The farmer's row, written from the cooperative default when they have none yet. Call inside a transaction."""
    if not farmer.cooperative_id:
        raise AllowanceError(NOT_IN_COOPERATIVE, 409, 'not_in_cooperative')
    row = _valid_row(farmer)
    if row is not None:
        return row
    return set_start(farmer, farmer.cooperative, SupplySettings.for_cooperative(farmer.cooperative).starter_boxes, by=None)


def _write(farmer, boxes: int, kind: str, reason: str, by) -> Allowance:
    with transaction.atomic():
        row = Allowance.objects.select_for_update().get(pk=_materialise(farmer).pk)
        old = row.boxes
        row.boxes = boxes
        row.save(update_fields=['boxes', 'since'])
        AllowanceChange.objects.create(
            farmer=farmer, cooperative_id=row.cooperative_id, old_boxes=old, new_boxes=boxes, kind=kind, reason=reason, decided_by=by,
        )
    return row


def lower(farmer, boxes, reason, by) -> Allowance:
    """A supervisor lowers an allowance, for example after an outbreak. Raising goes through a request."""
    boxes, reason = valid_boxes(boxes), _reason(reason)
    with transaction.atomic():
        now = _materialise(farmer).boxes
        if boxes == now:
            raise AllowanceError('That is the amount the farmer has now.', 422, 'no_change')
        if boxes > now:
            raise AllowanceError('A supervisor can only lower an allowance. A higher one is asked for by the farmer.', 422, 'cannot_raise')
        return _write(farmer, boxes, Kind.REDUCTION, reason, by)


def set_as_admin(farmer, boxes, reason, by) -> Allowance:
    """An admin sets any amount. A higher one reads as an amendment and a lower one as a reduction."""
    boxes, reason = valid_boxes(boxes), _reason(reason)
    with transaction.atomic():
        now = _materialise(farmer).boxes
        if boxes == now:
            raise AllowanceError('That is the amount the farmer has now.', 422, 'no_change')
        return _write(farmer, boxes, Kind.AMENDMENT if boxes > now else Kind.REDUCTION, reason, by)


def waiting_requests(user, cooperative_id=None):
    """The requests this person may decide, oldest first. A supervisor reaches their own cooperative, an admin all of them
    or the one named."""
    waiting = AllowanceRequest.objects.filter(status=Status.REQUESTED).select_related('farmer')
    if user.role == 'SUPERVISOR':
        if not user.cooperative_id:
            return waiting.none()
        waiting = waiting.filter(cooperative_id=user.cooperative_id)
    elif cooperative_id:
        waiting = waiting.filter(cooperative_id=cooperative_id)
    return waiting.order_by('created_at')


def ask(farmer, boxes, reason) -> AllowanceRequest:
    """A farmer asks for a different allowance. The amount in force is not written, only the request."""
    if not farmer.cooperative_id:
        raise AllowanceError(NOT_IN_COOPERATIVE, 409, 'not_in_cooperative')
    boxes, reason = valid_boxes(boxes), _reason(reason)
    if boxes == current(farmer)['boxes']:
        raise AllowanceError('That is your current amount.', 422, 'same_amount')
    try:
        with transaction.atomic():
            return AllowanceRequest.objects.create(farmer=farmer, cooperative_id=farmer.cooperative_id, boxes_asked=boxes, reason=reason)
    except IntegrityError:
        raise AllowanceError('You already have a request waiting. Withdraw it first to ask again.', 409, 'request_open') from None


def withdraw(request: AllowanceRequest, farmer) -> None:
    if request.farmer_id != farmer.pk:
        raise AllowanceError('We could not find that request.', 404, 'not_found')
    changed = AllowanceRequest.objects.filter(pk=request.pk, status=Status.REQUESTED).update(status=Status.WITHDRAWN, decided_at=timezone.now())
    if not changed:
        raise AllowanceError('That request is no longer waiting.', 409, 'nothing_to_withdraw')


def decide(request: AllowanceRequest, by, decision: str, boxes=None, note: str = '') -> AllowanceRequest:
    """Approve (the amount asked, or another) or decline (with a reason). Only a waiting request can be decided."""
    if decision not in ('approve', 'decline'):
        raise AllowanceError('Please approve or decline.', 400, 'bad_decision')
    note = str(note or '').strip()[:REASON_MAX]
    if decision == 'decline' and not note:
        raise AllowanceError('Please say why, so the farmer knows what to change.', 422, 'note_required')
    granted = valid_boxes(request.boxes_asked if boxes is None else boxes) if decision == 'approve' else None

    with transaction.atomic():
        status = Status.APPROVED if decision == 'approve' else Status.DECLINED
        changed = AllowanceRequest.objects.filter(pk=request.pk, status=Status.REQUESTED).update(
            status=status, boxes_granted=granted, decision_note=note, decided_by=by, decided_at=timezone.now(),
        )
        if not changed:
            raise AllowanceError('Nothing waits for a decision on that request.', 409, 'nothing_to_review')
        if decision == 'approve':
            farmer = User.objects.get(pk=request.farmer_id)
            # An error here rolls the decision back, so the request stays open for the supervisor of the right cooperative.
            if farmer.cooperative_id != request.cooperative_id:
                raise AllowanceError(NOT_IN_COOPERATIVE, 409, 'not_in_cooperative')
            if granted != _materialise(farmer).boxes:
                _write(farmer, granted, Kind.AMENDMENT, request.reason, by)
    request.refresh_from_db()
    return request
