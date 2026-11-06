"""The rules of room approval. This is the only code that changes a room's approval state.

A farmer's new room waits for a reviewer (a supervisor of the farmer's cooperative, or an admin). A change of size to an
approved room waits too, and the old size stays in force until it is approved. A decision is one conditional UPDATE, so
two reviewers deciding the same room at once cannot both win.
"""
from decimal import Decimal

from django.db.models import F, Q
from django.utils import timezone

from core.access import scope_rooms
from users.models import Role, User

from .models import RearingRoom

Approval = RearingRoom.Approval
TWO_PLACES = Decimal('0.01')


class ReviewError(Exception):
    """Something cannot be done. `message` is for the person, `code` for the page."""

    def __init__(self, message: str, status: int = 400, code: str = 'review_error'):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def _rounded(area) -> Decimal:
    return Decimal(area).quantize(TWO_PLACES)


def open_new(room: RearingRoom, creator) -> None:
    """Give a room that was just made its state. An admin's room is approved at once, anybody else's waits."""
    if creator.role == Role.ADMIN:
        fields = {'approval_status': Approval.APPROVED, 'reviewed_by': creator, 'reviewed_at': timezone.now()}
    else:
        fields = {'approval_status': Approval.PENDING}
    RearingRoom.objects.filter(pk=room.pk).update(**fields)
    room.refresh_from_db()


def change_area(room: RearingRoom, area, editor) -> str:
    """Give a room a new size. Returns what happened: queued, updated, resubmitted or unchanged."""
    area = _rounded(area)
    fields: dict
    if editor.role == Role.ADMIN:
        if room.area_m2 == area and room.pending_area_m2 is None:
            return 'unchanged'
        fields, outcome = {'area_m2': area, 'pending_area_m2': None}, 'updated'
    elif room.approval_status == Approval.REJECTED:
        # A new size is the way to ask again. The old reason stays until the next decision.
        fields, outcome = {'area_m2': area, 'approval_status': Approval.PENDING}, 'resubmitted'
    elif room.approval_status == Approval.PENDING:
        if room.area_m2 == area:
            return 'unchanged'
        fields, outcome = {'area_m2': area}, 'updated'
    elif room.area_m2 == area:
        # Back to the size in force. A change that was waiting is withdrawn.
        if room.pending_area_m2 is None:
            return 'unchanged'
        fields, outcome = {'pending_area_m2': None}, 'updated'
    else:
        # Even a room approved before sizes existed waits, or a farmer could set any size without a reviewer looking.
        fields, outcome = {'pending_area_m2': area}, 'queued'
    RearingRoom.objects.filter(pk=room.pk).update(**fields)
    room.refresh_from_db()
    return outcome


def decide(room: RearingRoom, reviewer, decision: str, note: str = '') -> RearingRoom:
    """Approve or reject what waits on a room: the room itself, or a queued size. A rejection needs a reason."""
    if decision not in ('approve', 'reject'):
        raise ReviewError('Please approve or reject.', 400, 'bad_decision')
    note = (note or '').strip()
    if decision == 'reject' and not note:
        raise ReviewError('Please say why, so the farmer knows what to change.', 422, 'note_required')

    stamp = {'reviewed_by': reviewer, 'reviewed_at': timezone.now(), 'review_note': note}
    rooms = RearingRoom.objects.filter(pk=room.pk)
    waiting_size = Q(approval_status=Approval.APPROVED, pending_area_m2__isnull=False)
    if decision == 'approve':
        changed = rooms.filter(approval_status=Approval.PENDING).update(approval_status=Approval.APPROVED, **stamp)
        if not changed:
            changed = rooms.filter(waiting_size).update(area_m2=F('pending_area_m2'), pending_area_m2=None, **stamp)
    else:
        changed = rooms.filter(approval_status=Approval.PENDING).update(approval_status=Approval.REJECTED, **stamp)
        if not changed:
            changed = rooms.filter(waiting_size).update(pending_area_m2=None, **stamp)
    if not changed:
        raise ReviewError('Nothing waits for a decision on that room.', 409, 'nothing_to_review')
    room.refresh_from_db()
    return room


def reviewers_for(room: RearingRoom) -> list:
    """Who is asked about a room: the active supervisors of the owner's cooperative, else every active admin."""
    owner = room.farm.owner
    if owner.cooperative_id:
        supervisors = list(User.objects.filter(role=Role.SUPERVISOR, cooperative_id=owner.cooperative_id, is_active=True))
        if supervisors:
            return supervisors
    return list(User.objects.filter(role=Role.ADMIN, is_active=True))


def waiting_for(user, cooperative_id: str | None = None):
    """The rooms this person may review that wait for a decision, newest first. An admin may narrow to one cooperative."""
    waiting = RearingRoom.objects.filter(Q(approval_status=Approval.PENDING) | Q(pending_area_m2__isnull=False))
    rooms = scope_rooms(user, waiting)
    if cooperative_id:
        rooms = rooms.filter(farm__owner__cooperative_id=cooperative_id)
    return rooms.select_related('farm__owner').order_by('-created_at')
