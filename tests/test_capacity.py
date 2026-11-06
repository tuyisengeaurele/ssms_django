"""How many boxes a room, and a farmer's rooms, can hold. Nothing is worked out until the space per box is known."""
from decimal import Decimal

import pytest

from farms.models import RearingRoom
from supply.capacity import farmer_capacity_boxes, room_capacity_boxes
from supply.models import SupplySettings
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_a_room_holds_the_whole_boxes_that_fit():
    assert room_capacity_boxes(Decimal('12'), Decimal('4')) == 3
    assert room_capacity_boxes(Decimal('11'), Decimal('4')) == 2
    assert room_capacity_boxes(Decimal('3.9'), Decimal('4')) == 0


@pytest.mark.parametrize('area,per_box', [(Decimal('12'), None), (None, Decimal('4')), (Decimal('12'), Decimal('0'))])
def test_unknown_or_nonsense_inputs_give_nothing(area, per_box):
    assert room_capacity_boxes(area, per_box) is None


def setup_farmer(m2_per_box='4'):
    coop = CooperativeFactory()
    SupplySettings.objects.create(cooperative=coop, m2_per_box=Decimal(m2_per_box) if m2_per_box else None)
    farmer = UserFactory(role='FARMER', cooperative=coop)
    return farmer, FarmFactory(owner=farmer)


def room(farm, name, area, **kw):
    return RearingRoom.objects.create(farm=farm, name=name, area_m2=Decimal(area) if area is not None else None, **kw)


def test_a_farmers_capacity_adds_up_their_approved_rooms():
    farmer, farm = setup_farmer()
    room(farm, 'A', '12')
    room(farm, 'B', '9')
    assert farmer_capacity_boxes(farmer) == 3 + 2


def test_pending_rejected_deleted_and_unsized_rooms_count_for_nothing():
    farmer, farm = setup_farmer()
    room(farm, 'A', '12')
    room(farm, 'Pending', '40', approval_status=RearingRoom.Approval.PENDING)
    room(farm, 'Rejected', '40', approval_status=RearingRoom.Approval.REJECTED)
    room(farm, 'Deleted', '40', is_active=False)
    room(farm, 'Unsized', None)
    assert farmer_capacity_boxes(farmer) == 3


def test_a_room_with_a_size_change_waiting_counts_at_the_size_in_force():
    farmer, farm = setup_farmer()
    room(farm, 'A', '12', pending_area_m2=Decimal('40'))
    assert farmer_capacity_boxes(farmer) == 3


def test_no_answer_when_the_space_per_box_is_not_known_or_no_room_has_a_size():
    farmer, farm = setup_farmer(m2_per_box=None)
    room(farm, 'A', '12')
    assert farmer_capacity_boxes(farmer) is None
    farmer, farm = setup_farmer()
    room(farm, 'Unsized', None)
    assert farmer_capacity_boxes(farmer) is None


def test_a_farmer_in_no_cooperative_has_no_capacity_answer():
    farmer = UserFactory(role='FARMER', cooperative=None)
    assert farmer_capacity_boxes(farmer) is None
