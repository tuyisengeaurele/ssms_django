"""What a farmer may ask for in a round. One function, so the page and the server give the same answer.

limit = the smallest of the farmer's allowance, the free space of the room, and the boxes in the round.
"""
from batches.models import Batch, BatchStage
from farms.models import RearingRoom

from . import allowance
from .capacity import room_capacity_boxes
from .models import EggRequest, SupplySettings


def _boxes_in_room(room) -> int:
    """Boxes already in the room: batches still running, counted in boxes, and boxes promised and not yet received."""
    running = Batch.objects.filter(room=room, is_active=True, quantity_unit='BOXES').exclude(stage=BatchStage.HARVEST)
    in_batches = sum(b.quantity or 0 for b in running)
    promised = EggRequest.objects.filter(room=room, status__in=[EggRequest.Status.APPROVED, EggRequest.Status.PART_APPROVED])
    return in_batches + sum(r.boxes_approved or 0 for r in promised)


def _room_free(room, settings) -> int | None:
    """The boxes the room has space for, 0 when it cannot take any, or None when that cannot be said yet."""
    # A room that waits, was turned down or was deleted holds nothing.
    if not room.is_active or room.approval_status != RearingRoom.Approval.APPROVED:
        return 0
    capacity = room_capacity_boxes(room.area_m2, settings.m2_per_box)
    if settings.one_open_batch_per_room and Batch.objects.filter(room=room, is_active=True).exclude(stage=BatchStage.HARVEST).exists():
        return 0
    if capacity is None:
        return None
    return max(0, capacity - _boxes_in_room(room))


def request_limit(farmer, room, round) -> dict:
    """`limit` and the numbers behind it, and `binding`, the bound that set it (allowance, room or stock, in that order on a tie)."""
    settings = SupplySettings.for_cooperative(round.cooperative)
    mine = allowance.current(farmer)['boxes']
    stock = round.stock_boxes
    free = _room_free(room, settings)
    bounds = [('allowance', mine)] + ([('room', free)] if free is not None else []) + [('stock', stock)]
    binding, limit = min(bounds, key=lambda pair: pair[1])
    return {'limit': max(0, limit), 'allowance': mine, 'room_free': free, 'stock': stock, 'binding': binding}
