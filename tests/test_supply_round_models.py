"""The tables of a supply round: the round, a farmer's request inside it, and the lot code a batch carries."""
from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from batches.models import Batch
from supply.models import EggRequest, SupplyRound, SupplySettings
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


def make_round(coop=None, **over):
    coop = coop or CooperativeFactory()
    fields = {
        'cooperative': coop, 'name': 'November round', 'stock_boxes': 10,
        'request_deadline': timezone.now() + timedelta(days=3),
        'delivery_date': (timezone.now() + timedelta(days=7)).date(), 'delivery_place': 'Cooperative store',
        'expected_harvest_date': (timezone.now() + timedelta(days=40)).date(),
    }
    return SupplyRound.objects.create(**{**fields, **over})


def make_request(rnd, farmer=None, **over):
    farmer = farmer or UserFactory(role='FARMER', cooperative=rnd.cooperative)
    farm = FarmFactory(owner=farmer)
    from farms.models import RearingRoom
    room = RearingRoom.objects.create(farm=farm, name='Room A')
    return EggRequest.objects.create(round=rnd, farmer=farmer, farm=farm, room=room, boxes_asked=2, **over)


def test_a_new_round_is_a_draft_that_is_not_paused_and_has_no_lot_code():
    rnd = make_round()
    assert (rnd.status, rnd.paused, rnd.lot_code, rnd.allocated_at) == ('draft', False, None, None)
    assert isinstance(rnd.pk, str)
    assert {s for s, _ in SupplyRound.Status.choices} == {'draft', 'open', 'closed', 'allocated', 'done', 'cancelled'}


def test_two_rounds_may_both_have_no_lot_code_but_never_the_same_one():
    make_round()
    make_round()
    make_round(lot_code='L-1')
    with pytest.raises(IntegrityError), transaction.atomic():
        make_round(lot_code='L-1')


def test_a_request_starts_submitted_with_nothing_decided_or_received():
    request = make_request(make_round())
    assert (request.status, request.boxes_approved, request.boxes_received, request.batch_id, request.condition) == ('submitted', None, None, None, '')
    assert {s for s, _ in EggRequest.Status.choices} == {'submitted', 'approved', 'part_approved', 'waitlisted', 'declined', 'received', 'not_collected', 'cancelled'}


def test_a_farmer_has_one_active_request_per_round_but_may_ask_again_after_cancelling():
    rnd = make_round()
    first = make_request(rnd)
    with pytest.raises(IntegrityError), transaction.atomic():
        EggRequest.objects.create(round=rnd, farmer=first.farmer, farm=first.farm, room=first.room, boxes_asked=1)
    EggRequest.objects.filter(pk=first.pk).update(status='cancelled')
    EggRequest.objects.create(round=rnd, farmer=first.farmer, farm=first.farm, room=first.room, boxes_asked=1)
    other_round = make_round(rnd.cooperative)
    EggRequest.objects.create(round=other_round, farmer=first.farmer, farm=first.farm, room=first.room, boxes_asked=1)


def test_a_batch_may_carry_a_lot_code_and_points_back_to_its_request():
    request = make_request(make_round())
    batch = BatchFactory(farm=request.farm)
    Batch.objects.filter(pk=batch.pk).update(lot_code='L-2026-11-A')
    EggRequest.objects.filter(pk=request.pk).update(batch=batch)
    batch.refresh_from_db()
    assert batch.lot_code == 'L-2026-11-A'
    assert batch.egg_request.pk == request.pk


def test_a_batch_has_no_lot_code_by_default():
    assert BatchFactory().lot_code == ''


def test_the_settings_keep_one_open_batch_per_room_on_by_default():
    assert SupplySettings.for_cooperative(CooperativeFactory()).one_open_batch_per_room is True
