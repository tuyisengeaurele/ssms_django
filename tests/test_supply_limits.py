"""What a farmer may ask for in a round: the smallest of their allowance, their room's free space and the stock."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from batches.models import Batch
from farms.models import RearingRoom
from supply import allowance
from supply.limits import request_limit
from supply.models import EggRequest, SupplyRound, SupplySettings
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


def setup(stock=10, boxes=2, m2_per_box='4', one_open=True):
    coop = CooperativeFactory()
    SupplySettings.objects.create(cooperative=coop, m2_per_box=Decimal(m2_per_box) if m2_per_box else None, one_open_batch_per_room=one_open)
    farmer = UserFactory(role='FARMER', cooperative=coop)
    allowance.set_start(farmer, coop, boxes, by=None)
    rnd = SupplyRound.objects.create(
        cooperative=coop, name='R', stock_boxes=stock, request_deadline=timezone.now() + timedelta(days=2),
        delivery_date=(timezone.now() + timedelta(days=5)).date(), delivery_place='Store', expected_harvest_date=(timezone.now() + timedelta(days=40)).date(),
    )
    farm = FarmFactory(owner=farmer)
    room = RearingRoom.objects.create(farm=farm, name='Room A', area_m2=Decimal('12'))
    return farmer, rnd, room


def test_the_allowance_binds_when_it_is_the_smallest():
    farmer, rnd, room = setup(stock=10, boxes=2)
    assert request_limit(farmer, room, rnd) == {'limit': 2, 'allowance': 2, 'room_free': 3, 'stock': 10, 'binding': 'allowance'}


def test_the_room_binds_when_it_is_the_smallest():
    farmer, rnd, room = setup(stock=10, boxes=5)
    result = request_limit(farmer, room, rnd)
    assert (result['limit'], result['room_free'], result['binding']) == (3, 3, 'room')


def test_the_stock_binds_when_it_is_the_smallest():
    farmer, rnd, room = setup(stock=1, boxes=5)
    result = request_limit(farmer, room, rnd)
    assert (result['limit'], result['binding']) == (1, 'stock')


def test_a_tie_is_named_after_the_first_bound_in_the_order_allowance_room_stock():
    farmer, rnd, room = setup(stock=3, boxes=3)
    assert request_limit(farmer, room, rnd)['binding'] == 'allowance'


def test_the_free_space_of_a_room_is_what_is_left_after_the_boxes_already_in_it():
    farmer, rnd, room = setup(stock=10, boxes=5, one_open=False)
    batch = BatchFactory(farm=room.farm, stage='LARVA')
    Batch.objects.filter(pk=batch.pk).update(room=room, quantity=2, quantity_unit='BOXES')
    assert request_limit(farmer, room, rnd)['room_free'] == 1


def test_a_harvested_a_deleted_or_a_worm_counted_batch_takes_no_space():
    farmer, rnd, room = setup(stock=10, boxes=5, one_open=False)
    for kwargs in ({'stage': 'HARVEST'}, {'is_active': False}):
        batch = BatchFactory(farm=room.farm, **kwargs)
        Batch.objects.filter(pk=batch.pk).update(room=room, quantity=2, quantity_unit='BOXES')
    worms = BatchFactory(farm=room.farm, stage='LARVA')
    Batch.objects.filter(pk=worms.pk).update(room=room, quantity=50000, quantity_unit='WORMS')
    assert request_limit(farmer, room, rnd)['room_free'] == 3


def test_boxes_already_promised_for_the_room_and_not_yet_received_take_space_too():
    farmer, rnd, room = setup(stock=10, boxes=5)
    earlier = SupplyRound.objects.create(
        cooperative=rnd.cooperative, name='Earlier', stock_boxes=5, request_deadline=timezone.now(), delivery_date=timezone.now().date(),
        expected_harvest_date=timezone.now().date(), status='allocated',
    )
    EggRequest.objects.create(round=earlier, farmer=farmer, farm=room.farm, room=room, boxes_asked=2, status='approved', boxes_approved=2)
    assert request_limit(farmer, room, rnd)['room_free'] == 1


def test_a_received_or_declined_request_no_longer_holds_space():
    farmer, rnd, room = setup(stock=10, boxes=5)
    earlier = SupplyRound.objects.create(
        cooperative=rnd.cooperative, name='Earlier', stock_boxes=5, request_deadline=timezone.now(), delivery_date=timezone.now().date(),
        expected_harvest_date=timezone.now().date(), status='done',
    )
    EggRequest.objects.create(round=earlier, farmer=farmer, farm=room.farm, room=room, boxes_asked=2, status='received', boxes_approved=2, boxes_received=2)
    assert request_limit(farmer, room, rnd)['room_free'] == 3


def test_a_room_with_a_batch_still_running_has_no_space_when_one_open_batch_per_room_is_on():
    farmer, rnd, room = setup(stock=10, boxes=5, one_open=True)
    batch = BatchFactory(farm=room.farm, stage='COCOON')
    Batch.objects.filter(pk=batch.pk).update(room=room, quantity=1, quantity_unit='BOXES')
    result = request_limit(farmer, room, rnd)
    assert (result['limit'], result['room_free'], result['binding']) == (0, 0, 'room')


@pytest.mark.parametrize('fields', [
    {'approval_status': RearingRoom.Approval.PENDING},
    {'approval_status': RearingRoom.Approval.REJECTED},
    {'is_active': False},
])
def test_a_room_that_is_pending_rejected_or_deleted_has_no_space(fields):
    farmer, rnd, room = setup()
    RearingRoom.objects.filter(pk=room.pk).update(**fields)
    room.refresh_from_db()
    result = request_limit(farmer, room, rnd)
    assert (result['limit'], result['room_free']) == (0, 0)


def test_with_the_space_per_box_unknown_no_room_cap_is_applied_and_the_answer_says_so():
    farmer, rnd, room = setup(stock=10, boxes=4, m2_per_box=None)
    result = request_limit(farmer, room, rnd)
    assert (result['limit'], result['room_free'], result['binding']) == (4, None, 'allowance')


def test_a_room_with_no_size_has_no_cap_either():
    farmer, rnd, room = setup()
    RearingRoom.objects.filter(pk=room.pk).update(area_m2=None)
    room.refresh_from_db()
    assert request_limit(farmer, room, rnd)['room_free'] is None


def test_the_limit_is_never_negative():
    farmer, rnd, room = setup(stock=0, boxes=0)
    assert request_limit(farmer, room, rnd)['limit'] == 0
