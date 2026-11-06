"""How many boxes of eggs a room can hold. Nothing is worked out until the cooperative says how much room one box needs."""
from decimal import Decimal

from farms.models import RearingRoom

from .models import SupplySettings


def room_capacity_boxes(area_m2, m2_per_box) -> int | None:
    """The whole boxes that fit, or None when either number is missing or the space per box makes no sense."""
    if area_m2 is None or m2_per_box is None or Decimal(m2_per_box) <= 0:
        return None
    return int(Decimal(area_m2) // Decimal(m2_per_box))


def farmer_capacity_boxes(farmer) -> int | None:
    """What a farmer's approved rooms can hold together, or None when it cannot be said yet.

    A room that waits, was turned down or was deleted holds nothing, and a room with a size change waiting counts at the
    size in force.
    """
    if not farmer.cooperative_id:
        return None
    m2_per_box = SupplySettings.for_cooperative(farmer.cooperative).m2_per_box
    if m2_per_box is None:
        return None
    areas = list(
        RearingRoom.objects.filter(
            farm__owner=farmer, farm__is_active=True, is_active=True, approval_status=RearingRoom.Approval.APPROVED, area_m2__isnull=False,
        ).values_list('area_m2', flat=True)
    )
    if not areas:
        return None
    return sum(room_capacity_boxes(area, m2_per_box) or 0 for area in areas)
