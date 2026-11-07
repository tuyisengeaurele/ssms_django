"""Earned allowances: a farmer who finishes a lot from a supply round in good order may have earned one more box.

A suggestion is made when a harvest is recorded, and waits in the supervisor's Decisions inbox. The supervisor approves it in one
go or dismisses it. The rule is written down here because the design leaves it open: mortality is not used, since that needs the
worms per box that a sericulture officer has to give.
"""
import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from alerts.models import AlertLog
from batches.models import Batch

from . import allowance
from .capacity import farmer_capacity_boxes
from .models import ALLOWANCE_MAX, AllowanceRequest, AllowanceSuggestion, EggRequest

logger = logging.getLogger(__name__)
Status = AllowanceSuggestion.Status
# One more box at a time. A bigger step is a decision for a supervisor to make with an amendment.
NUDGE_STEP = 1


def _consider(batch: Batch) -> AllowanceSuggestion | None:
    request = EggRequest.objects.filter(batch=batch).select_related('round', 'farmer').first()
    if request is None:
        return None
    farmer = request.farmer
    # Only a lot made by the cooperative the farmer is in now says anything about their place in it.
    if not farmer.cooperative_id or farmer.cooperative_id != request.round.cooperative_id:
        return None
    if AllowanceSuggestion.objects.filter(batch=batch).exists():
        return None
    now = allowance.current(farmer)['boxes']
    # They used all of what they were allowed. A farmer who took less has not shown they need more.
    if now < 1 or (request.boxes_received or 0) < now:
        return None
    if AlertLog.objects.filter(batch=batch, type='DISEASE', resolved_at__isnull=True).exists():
        return None
    if AllowanceRequest.objects.filter(farmer=farmer, status=AllowanceRequest.Status.REQUESTED).exists():
        return None
    suggested = min(now + NUDGE_STEP, ALLOWANCE_MAX)
    if suggested <= now:
        return None
    capacity = farmer_capacity_boxes(farmer)
    if capacity is not None and suggested > capacity:
        return None
    try:
        with transaction.atomic():
            return AllowanceSuggestion.objects.create(
                farmer=farmer, cooperative_id=farmer.cooperative_id, batch=batch, old_boxes=now, suggested_boxes=suggested,
            )
    except IntegrityError:
        # A second harvest of the same batch, at the same moment as the first.
        return None


def consider(batch: Batch) -> AllowanceSuggestion | None:
    """Make a suggestion for a batch that was just harvested, when it has earned one. It never fails the harvest."""
    try:
        return _consider(batch)
    except Exception:
        logger.exception('Could not consider an earned allowance for batch %s', batch.pk)
        return None


def waiting(user, cooperative_id=None):
    """The suggestions this person may decide, oldest first."""
    found = AllowanceSuggestion.objects.filter(status=Status.PENDING).select_related('farmer', 'batch')
    if user.role == 'SUPERVISOR':
        if not user.cooperative_id:
            return found.none()
        found = found.filter(cooperative_id=user.cooperative_id)
    elif cooperative_id:
        found = found.filter(cooperative_id=cooperative_id)
    return found.order_by('created_at')


def decide(suggestion: AllowanceSuggestion, by, decision: str) -> AllowanceSuggestion:
    """Approve (raise the allowance) or dismiss. An approval is refused as stale when the allowance has moved since."""
    if decision not in ('approve', 'dismiss'):
        raise allowance.AllowanceError('Please approve or dismiss.', 400, 'bad_decision')
    now = timezone.now()
    suggestion.refresh_from_db()
    # Something already decided is not "stale": the allowance has moved because of that very decision.
    if suggestion.status != Status.PENDING:
        raise allowance.AllowanceError('Nothing waits for a decision on that suggestion.', 409, 'nothing_to_review')
    if decision == 'dismiss':
        changed = AllowanceSuggestion.objects.filter(pk=suggestion.pk, status=Status.PENDING).update(status=Status.DISMISSED, decided_by=by, decided_at=now)
        if not changed:
            raise allowance.AllowanceError('Nothing waits for a decision on that suggestion.', 409, 'nothing_to_review')
        suggestion.refresh_from_db()
        return suggestion

    farmer = suggestion.farmer
    if farmer.cooperative_id != suggestion.cooperative_id or allowance.current(farmer)['boxes'] != suggestion.old_boxes:
        # The reason for the suggestion no longer holds. It is closed so it does not wait for ever.
        AllowanceSuggestion.objects.filter(pk=suggestion.pk, status=Status.PENDING).update(status=Status.STALE, decided_by=by, decided_at=now)
        raise allowance.AllowanceError('This farmer\'s allowance has changed since, so this suggestion no longer applies.', 409, 'stale')
    with transaction.atomic():
        changed = AllowanceSuggestion.objects.filter(pk=suggestion.pk, status=Status.PENDING).update(status=Status.APPROVED, decided_by=by, decided_at=now)
        if not changed:
            raise allowance.AllowanceError('Nothing waits for a decision on that suggestion.', 409, 'nothing_to_review')
        allowance.apply_suggestion(farmer, suggestion.suggested_boxes, f'Finished lot {suggestion.batch.lot_code} in good order', by)
    suggestion.refresh_from_db()
    return suggestion
