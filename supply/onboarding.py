"""The getting started checklist of a farmer: where they are, and who they are waiting for.

Every step is worked out from what already exists, so the list can never disagree with the rest of the app. The page decides
how to word each state.
"""
from django.utils import timezone

from batches.models import Batch
from cooperatives.reviewers import reviewers_of
from farms.models import Farm, RearingRoom

from .models import EggRequest, SupplyRound

Req = EggRequest.Status
LIVE_ROUNDS = [SupplyRound.Status.OPEN, SupplyRound.Status.CLOSED, SupplyRound.Status.ALLOCATED]


def _room_step(farmer) -> dict:
    # One read of the farmer's rooms. A farmer has a handful, and three questions about them were three round trips.
    rooms = list(RearingRoom.objects.filter(farm__owner=farmer, farm__is_active=True, is_active=True).only('name', 'approval_status', 'review_note', 'reviewed_at'))
    if any(r.approval_status == RearingRoom.Approval.APPROVED for r in rooms):
        return {'key': 'room', 'state': 'done', 'detail': {}}
    if any(r.approval_status == RearingRoom.Approval.PENDING for r in rooms):
        return {'key': 'room', 'state': 'waiting', 'detail': {'waiting_for': [r.name for r in reviewers_of(farmer)]}}
    rejected = [r for r in rooms if r.approval_status == RearingRoom.Approval.REJECTED]
    if rejected:
        # The newest review. As in the database's descending order, a room with no review date sorts first.
        turned_down = max(rejected, key=lambda r: (r.reviewed_at is None, r.reviewed_at.timestamp() if r.reviewed_at else 0))
        return {'key': 'room', 'state': 'rejected', 'detail': {'note': turned_down.review_note}}
    return {'key': 'room', 'state': 'todo', 'detail': {}}


def _eggs_step(farmer, has_approved_room: bool) -> dict:
    # One read of the farmer's requests with their rounds, newest first. The steps below look through the list, not the database.
    mine = list(EggRequest.objects.filter(farmer=farmer).select_related('round').order_by('-created_at'))
    if any(r.status == Req.RECEIVED for r in mine):
        return {'key': 'eggs', 'state': 'done', 'detail': {}}
    live = next((r for r in mine if r.round.status in LIVE_ROUNDS and r.status in (Req.SUBMITTED, Req.APPROVED, Req.PART_APPROVED)), None)
    if live is not None:
        round = live.round
        if live.status == Req.SUBMITTED:
            return {'key': 'eggs', 'state': 'waiting', 'detail': {'round_name': round.name, 'waiting_for': [r.name for r in reviewers_of(farmer)]}}
        return {'key': 'eggs', 'state': 'approved', 'detail': {
            'round_name': round.name, 'boxes': live.boxes_approved, 'delivery_date': round.delivery_date, 'delivery_place': round.delivery_place,
        }}
    # A round to ask in comes before an old disappointment: the farmer's next move is to ask again.
    if farmer.cooperative_id:
        open_round = SupplyRound.objects.filter(
            cooperative_id=farmer.cooperative_id, status=SupplyRound.Status.OPEN, request_deadline__gt=timezone.now(),
        ).order_by('-created_at').first()
        if open_round is not None:
            return {'key': 'eggs', 'state': 'ready' if has_approved_room else 'needs_room', 'detail': {'round_name': open_round.name, 'request_deadline': open_round.request_deadline}}
    # A round that gave this farmer nothing says why, until a new round opens. It may already be done, since a round with
    # nobody promised any eggs finishes at once.
    left_out = next((r for r in mine if r.status in (Req.WAITLISTED, Req.DECLINED)), None)
    if left_out is not None:
        return {'key': 'eggs', 'state': 'not_given', 'detail': {'round_name': left_out.round.name, 'note': left_out.decision_note}}
    return {'key': 'eggs', 'state': 'no_round', 'detail': {}}


def steps(farmer) -> dict:
    """The steps in order, and whether the farmer is past all of them."""
    farm = Farm.objects.filter(owner=farmer, is_active=True).order_by('created_at').first()
    room = _room_step(farmer)
    eggs = _eggs_step(farmer, has_approved_room=room['state'] == 'done')
    listed = [
        {'key': 'cooperative', 'state': 'done' if farmer.cooperative_id else 'todo', 'detail': {}},
        {'key': 'farm', 'state': 'done' if farm else 'todo', 'detail': {'farm_id': farm.pk} if farm else {}},
        room,
        eggs,
    ]
    # A farmer who already runs batches, started by hand or from a round, has nothing left to be shown the way to.
    complete = eggs['state'] == 'done' or Batch.objects.filter(farm__owner=farmer, is_active=True).exists()
    return {'complete': complete, 'steps': listed}
