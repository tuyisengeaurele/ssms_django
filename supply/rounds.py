"""The rules of a supply round. This is the only code that changes a round or an egg request.

A round goes draft, open, closed (by hand, or by its deadline), allocated (the supervisor confirmed the split) and done.
Approval is a promise and receipt is the fact: a batch is made only when the eggs were received. Every change that two
people could make at once is one conditional UPDATE, so one of them wins and the other is told.
"""
import secrets
from datetime import date, datetime, time

from django.db import IntegrityError, transaction
from django.utils import timezone

from batches.models import Batch
from batches.placement import place_batch
from farms.models import RearingRoom
from farms.room_review import ROOM_NOT_APPROVED
from users.models import User

from .limits import request_limit
from .models import EggRequest, SupplyRound
from .split import SplitEntry, propose_split

Status = SupplyRound.Status
Req = EggRequest.Status
NAME_MAX = 120
PLACE_MAX = 200
NOTE_MAX = 500
STOCK_MAX = 100_000


class RoundError(Exception):
    """Something cannot be done. `message` is for the person, `code` for the page."""

    def __init__(self, message: str, status: int = 400, code: str = 'round_error'):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def _whole(value, low: int, high: int, message: str, code: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
        raise RoundError(message, 422, code)
    return value


def _boxes_word(n: int) -> str:
    return '1 box' if n == 1 else f'{n} boxes'


# ── the round itself ──────────────────────────────────────────────────────────

def _clean(values: dict) -> dict:
    """Check the facts of a round. A message names what is wrong, so the form can say it before sending."""
    name = str(values.get('name') or '').strip()
    place = str(values.get('delivery_place') or '').strip()
    if not 1 <= len(name) <= NAME_MAX:
        raise RoundError(f'Please give the round a name of up to {NAME_MAX} characters.', 422, 'bad_round')
    if not 1 <= len(place) <= PLACE_MAX:
        raise RoundError(f'Please say where the eggs are handed over, in up to {PLACE_MAX} characters.', 422, 'bad_round')
    stock = _whole(values.get('stock_boxes'), 0, STOCK_MAX, f'Please enter the boxes in the round as a whole number from 0 to {STOCK_MAX}.', 'bad_round')
    deadline, delivery, harvest = values.get('request_deadline'), values.get('delivery_date'), values.get('expected_harvest_date')
    if not isinstance(deadline, datetime) or not isinstance(delivery, date) or not isinstance(harvest, date):
        raise RoundError('Please give the request deadline, the delivery day and the expected harvest.', 422, 'bad_round')
    if delivery < timezone.localtime(deadline).date():
        raise RoundError('The eggs cannot be handed over before the request deadline.', 422, 'bad_round')
    if harvest <= delivery:
        raise RoundError('The expected harvest must come after the delivery day.', 422, 'bad_round')
    return {
        'name': name, 'delivery_place': place, 'stock_boxes': stock, 'request_deadline': deadline,
        'delivery_date': delivery, 'expected_harvest_date': harvest,
    }


def create_round(cooperative, by, **values) -> SupplyRound:
    return SupplyRound.objects.create(cooperative=cooperative, created_by=by, **_clean(values))


def edit_round(round: SupplyRound, **changes) -> SupplyRound:
    """Change the facts of a draft or open round. A confirmed one is a promise already made."""
    round.refresh_from_db()
    if round.status not in (Status.DRAFT, Status.OPEN):
        raise RoundError('This round can no longer be changed.', 409, 'not_editable')
    current = {
        'name': round.name, 'delivery_place': round.delivery_place, 'stock_boxes': round.stock_boxes,
        'request_deadline': round.request_deadline, 'delivery_date': round.delivery_date, 'expected_harvest_date': round.expected_harvest_date,
    }
    cleaned = _clean({**current, **changes})
    changed = SupplyRound.objects.filter(pk=round.pk, status__in=[Status.DRAFT, Status.OPEN]).update(**cleaned)
    if not changed:
        raise RoundError('This round can no longer be changed.', 409, 'not_editable')
    round.refresh_from_db()
    return round


def effective_status(round: SupplyRound, now=None) -> str:
    """The status to show. An open round whose deadline has passed is closed, even before anyone has pressed a button."""
    now = now or timezone.now()
    if round.status == Status.OPEN and now >= round.request_deadline:
        return Status.CLOSED
    return round.status


def _new_lot_code() -> str:
    stamp = timezone.now().strftime('%y%m')
    while True:
        code = f'L{stamp}-{secrets.token_hex(2).upper()}'
        if not SupplyRound.objects.filter(lot_code=code).exists():
            return code


def open_round(round: SupplyRound, by) -> SupplyRound:
    if round.request_deadline <= timezone.now():
        raise RoundError('The request deadline has passed. Please choose a later one first.', 422, 'deadline_passed')
    changed = SupplyRound.objects.filter(pk=round.pk, status=Status.DRAFT).update(status=Status.OPEN, lot_code=_new_lot_code())
    if not changed:
        raise RoundError('This round is already open.', 409, 'not_a_draft')
    round.refresh_from_db()
    return round


def close_round(round: SupplyRound) -> SupplyRound:
    changed = SupplyRound.objects.filter(pk=round.pk, status=Status.OPEN).update(status=Status.CLOSED)
    if not changed:
        raise RoundError('Only an open round can be closed.', 409, 'not_open')
    round.refresh_from_db()
    return round


def cancel_round(round: SupplyRound, by, note: str) -> list:
    """Cancel a round. Requests that are waiting for eggs are cancelled with the reason, and what was received stays."""
    note = str(note or '').strip()[:NOTE_MAX]
    if not note:
        raise RoundError('Please say why, so the farmers know.', 422, 'note_required')
    with transaction.atomic():
        changed = SupplyRound.objects.filter(pk=round.pk).exclude(status__in=[Status.DONE, Status.CANCELLED]).update(status=Status.CANCELLED)
        if not changed:
            raise RoundError('This round is already over.', 409, 'not_cancellable')
        waiting = list(
            EggRequest.objects.filter(round=round, status__in=[Req.SUBMITTED, Req.APPROVED, Req.PART_APPROVED, Req.WAITLISTED]).select_related('farmer')
        )
        EggRequest.objects.filter(pk__in=[q.pk for q in waiting]).update(status=Req.CANCELLED, decision_note=note, decided_by=by, decided_at=timezone.now())
    round.refresh_from_db()
    return waiting


def set_paused(round: SupplyRound, paused: bool) -> SupplyRound:
    changed = SupplyRound.objects.filter(pk=round.pk, status__in=[Status.OPEN, Status.CLOSED, Status.ALLOCATED]).update(paused=paused)
    if not changed:
        raise RoundError('Only a round that is running can be paused.', 409, 'not_pausable')
    round.refresh_from_db()
    return round


def _finish_if_done(round: SupplyRound) -> None:
    """A confirmed round is done when no promise is left: every one was received or marked not collected."""
    if not EggRequest.objects.filter(round=round, status__in=[Req.APPROVED, Req.PART_APPROVED]).exists():
        SupplyRound.objects.filter(pk=round.pk, status=Status.ALLOCATED).update(status=Status.DONE)


# ── a farmer's request ────────────────────────────────────────────────────────

def _over_limit_message(limit: dict, room) -> str:
    text = f'You can ask for up to {_boxes_word(limit["limit"])}.'
    if limit['binding'] == 'allowance':
        return f'{text} Your allowance is {limit["allowance"]}.'
    if limit['binding'] == 'room':
        return f'{text} {room.name} has space for {limit["room_free"]}.'
    return f'{text} Only {_boxes_word(limit["stock"])} are in this round.'


def submit_request(farmer, round: SupplyRound, room, boxes, note: str = '') -> EggRequest:
    if not farmer.cooperative_id or farmer.cooperative_id != round.cooperative_id:
        raise RoundError('We could not find that round.', 404, 'not_found')
    if room.farm.owner_id != farmer.pk or not room.farm.is_active:
        raise RoundError('We could not find that room.', 404, 'room_not_found')
    state = effective_status(round)
    if state == Status.CLOSED and round.status == Status.OPEN:
        raise RoundError('The deadline for this round has passed.', 409, 'deadline_passed')
    if state != Status.OPEN:
        raise RoundError('This round is not taking requests.', 409, 'round_not_open')
    if not room.is_active or room.approval_status != RearingRoom.Approval.APPROVED:
        raise RoundError(ROOM_NOT_APPROVED, 422, 'room_not_approved')
    boxes = _whole(boxes, 1, STOCK_MAX, 'Please ask for a whole number of boxes, from 1.', 'bad_boxes')
    limit = request_limit(farmer, room, round)
    if boxes > limit['limit']:
        raise RoundError(_over_limit_message(limit, room), 422, 'over_limit')
    try:
        with transaction.atomic():
            return EggRequest.objects.create(
                round=round, farmer=farmer, farm=room.farm, room=room, boxes_asked=boxes, note=str(note or '').strip()[:NOTE_MAX],
            )
    except IntegrityError:
        raise RoundError('You already have a request in this round. Cancel it first to ask again.', 409, 'request_exists') from None


def cancel_request(request: EggRequest, farmer) -> EggRequest:
    """The farmer takes a request back, before or after it was decided, until the eggs are received."""
    if request.farmer_id != farmer.pk:
        raise RoundError('We could not find that request.', 404, 'not_found')
    changed = EggRequest.objects.filter(
        pk=request.pk, status__in=[Req.SUBMITTED, Req.APPROVED, Req.PART_APPROVED, Req.WAITLISTED],
    ).update(status=Req.CANCELLED)
    if not changed:
        raise RoundError('That request can no longer be cancelled.', 409, 'nothing_to_cancel')
    request.refresh_from_db()
    _finish_if_done(request.round)
    return request


# ── the split ─────────────────────────────────────────────────────────────────

def _waiting(round: SupplyRound):
    return EggRequest.objects.filter(round=round, status=Req.SUBMITTED).select_related('farmer', 'room', 'farm').order_by('created_at', 'pk')


def proposal(round: SupplyRound) -> list[dict]:
    """The split the system proposes for the requests that wait. The supervisor may edit it before confirming."""
    if effective_status(round) != Status.CLOSED:
        raise RoundError('The split can be made once the requests are closed.', 409, 'not_closed')
    waiting = list(_waiting(round))
    limits = [request_limit(q.farmer, q.room, round) for q in waiting]
    entries = [SplitEntry(q.pk, q.boxes_asked, lim['limit'], rank) for rank, (q, lim) in enumerate(zip(waiting, limits))]
    proposed = propose_split(round.stock_boxes, entries)
    return [
        {
            'id': q.pk,
            'farmer': {'id': q.farmer_id, 'name': q.farmer.name, 'email': q.farmer.email},
            'room': {'id': q.room_id, 'name': q.room.name},
            'asked': q.boxes_asked,
            'allowance': lim['allowance'],
            'room_free': lim['room_free'],
            'ceiling': min(q.boxes_asked, lim['limit']),
            'proposed': boxes,
            'note': q.note,
            'created_at': q.created_at,
        }
        for q, lim, boxes in zip(waiting, limits, proposed)
    ]


def confirm(round: SupplyRound, by, items: list[dict]) -> SupplyRound:
    """Write the split the supervisor confirmed. Each item is `{id, boxes, decline_note?}` for every waiting request."""
    round.refresh_from_db()
    if round.status == Status.ALLOCATED:
        raise RoundError('This round was already confirmed.', 409, 'already_allocated')
    if effective_status(round) != Status.CLOSED:
        raise RoundError('The split can be confirmed once the requests are closed.', 409, 'not_closed')
    with transaction.atomic():
        waiting = {q.pk: q for q in _waiting(round).select_for_update()}
        given = {str(i.get('id')): i for i in items or []}
        if set(given) != set(waiting):
            raise RoundError('Please decide every request that waits.', 422, 'incomplete')
        total = 0
        decided = []
        for pk, request in waiting.items():
            item = given[pk]
            boxes = _whole(item.get('boxes'), 0, STOCK_MAX, 'Please give each request a whole number of boxes.', 'bad_boxes')
            if boxes > request.boxes_asked:
                raise RoundError('Nobody can be given more than they asked for.', 422, 'over_asked')
            total += boxes
            decided.append((request, boxes, str(item.get('decline_note') or '').strip()[:NOTE_MAX]))
        if total > round.stock_boxes:
            raise RoundError(f'That is {_boxes_word(total)}, and only {_boxes_word(round.stock_boxes)} are in this round.', 422, 'over_stock')
        changed = SupplyRound.objects.filter(pk=round.pk, status__in=[Status.OPEN, Status.CLOSED]).update(status=Status.ALLOCATED, allocated_at=timezone.now())
        if not changed:
            raise RoundError('This round was already confirmed.', 409, 'already_allocated')
        now = timezone.now()
        for request, boxes, note in decided:
            if boxes >= request.boxes_asked:
                status = Req.APPROVED
            elif boxes > 0:
                status = Req.PART_APPROVED
            else:
                status = Req.DECLINED if note else Req.WAITLISTED
            EggRequest.objects.filter(pk=request.pk).update(status=status, boxes_approved=boxes, decision_note=note, decided_by=by, decided_at=now)
        # Nobody was promised any eggs, so there is nothing left to hand over.
        _finish_if_done(round)
    round.refresh_from_db()
    return round


# ── receiving ─────────────────────────────────────────────────────────────────

def _harvest_moment(day: date) -> datetime:
    return timezone.make_aware(datetime.combine(day, time(12, 0)))


def receive(request: EggRequest, by, boxes, condition: str) -> Batch:
    """The eggs arrived. The farmer, or the supervisor for them, says how many and in what state. This makes the batch."""
    if condition not in EggRequest.Condition.values:
        raise RoundError('Please say whether the eggs arrived in good condition or damaged.', 422, 'bad_condition')
    boxes = _whole(boxes, 1, STOCK_MAX, 'Please enter the boxes you received as a whole number, from 1.', 'bad_boxes')
    request.refresh_from_db()
    if request.status == Req.RECEIVED:
        raise RoundError('These eggs were already recorded as received.', 409, 'already_received')
    if request.status not in (Req.APPROVED, Req.PART_APPROVED):
        raise RoundError('This request has no eggs to receive.', 409, 'not_approved')
    round = request.round
    if round.status != Status.ALLOCATED:
        raise RoundError('This round is not handing out eggs.', 409, 'round_not_delivering')
    if round.paused:
        raise RoundError('This round is paused, so nothing is handed out now.', 409, 'round_paused')
    if boxes > (request.boxes_approved or 0):
        raise RoundError(f'Only {_boxes_word(request.boxes_approved or 0)} were promised.', 422, 'over_approved')
    room = request.room
    if not room.is_active or room.approval_status != RearingRoom.Approval.APPROVED:
        raise RoundError(ROOM_NOT_APPROVED, 409, 'room_not_approved')

    with transaction.atomic():
        changed = EggRequest.objects.filter(pk=request.pk, status__in=[Req.APPROVED, Req.PART_APPROVED]).update(
            status=Req.RECEIVED, boxes_received=boxes, condition=condition, received_by=by, received_at=timezone.now(),
        )
        if not changed:
            raise RoundError('These eggs were already recorded as received.', 409, 'already_received')
        batch = Batch.objects.create(
            farm=request.farm, expected_harvest_date=_harvest_moment(round.expected_harvest_date), quantity=boxes,
            quantity_unit='BOXES', lot_code=round.lot_code or '',
        )
        place_batch(batch, room, when=batch.start_date)
        EggRequest.objects.filter(pk=request.pk).update(batch=batch)
        _finish_if_done(round)
    request.refresh_from_db()
    return batch


def mark_not_collected(request: EggRequest, by) -> EggRequest:
    """The farmer never came for the eggs. This is marked by hand."""
    changed = EggRequest.objects.filter(pk=request.pk, status__in=[Req.APPROVED, Req.PART_APPROVED]).update(status=Req.NOT_COLLECTED)
    if not changed:
        raise RoundError('This request has no eggs waiting to be collected.', 409, 'not_approved')
    request.refresh_from_db()
    _finish_if_done(request.round)
    return request


def farmers_of(round: SupplyRound):
    """Every active farmer of the round's cooperative, for telling them a round opened."""
    return User.objects.filter(cooperative_id=round.cooperative_id, role='FARMER', is_active=True)

