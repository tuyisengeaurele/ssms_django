"""The rules of a supply round. `supply/rounds.py` is the only code that changes a round or an egg request."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from batches.models import Batch
from farms.models import RearingRoom
from supply import allowance, rounds
from supply.models import EggRequest, SupplyRound, SupplySettings
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


def fails(call):
    with pytest.raises(rounds.RoundError) as caught:
        call()
    return caught.value.code, caught.value.status


@pytest.fixture
def coop():
    SupplySettings.objects.all().delete()
    return CooperativeFactory()


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')


def farmer_with_room(coop, boxes=3, area='20', name='Room A', m2='4'):
    """A farmer in the cooperative with an allowance and an approved room (20 m2 holds 5 boxes at 4 m2 a box)."""
    settings = SupplySettings.for_cooperative(coop)
    settings.m2_per_box = Decimal(m2) if m2 else None
    settings.save()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    allowance.set_start(farmer, coop, boxes, by=None)
    room = RearingRoom.objects.create(farm=FarmFactory(owner=farmer), name=name, area_m2=Decimal(area))
    return farmer, room


def fields(**over):
    base = {
        'name': 'November round', 'stock_boxes': 10, 'request_deadline': timezone.now() + timedelta(days=3),
        'delivery_date': (timezone.now() + timedelta(days=7)).date(), 'delivery_place': 'Cooperative store',
        'expected_harvest_date': (timezone.now() + timedelta(days=40)).date(),
    }
    return {**base, **over}


def open_round(coop, supervisor, **over):
    rnd = rounds.create_round(coop, supervisor, **fields(**over))
    return rounds.open_round(rnd, supervisor)


def close_by_deadline(rnd):
    SupplyRound.objects.filter(pk=rnd.pk).update(request_deadline=timezone.now() - timedelta(minutes=1))
    rnd.refresh_from_db()
    return rnd


def allocated_round(coop, supervisor, requests, stock=10):
    """An open round with the given (farmer, room, boxes) requests, closed and confirmed at what was asked."""
    rnd = open_round(coop, supervisor, stock_boxes=stock)
    made = [rounds.submit_request(f, rnd, r, n) for f, r, n in requests]
    rounds.close_round(rnd)
    rounds.confirm(rnd, supervisor, [{'id': q.pk, 'boxes': q.boxes_asked} for q in made])
    rnd.refresh_from_db()
    return rnd, [EggRequest.objects.get(pk=q.pk) for q in made]


# ── making and opening a round ────────────────────────────────────────────────

def test_a_new_round_is_a_draft_made_by_the_supervisor_without_a_lot_code(coop, supervisor):
    rnd = rounds.create_round(coop, supervisor, **fields())
    assert (rnd.status, rnd.lot_code, rnd.created_by_id, rnd.cooperative_id) == ('draft', None, supervisor.pk, coop.pk)


@pytest.mark.parametrize('bad', [
    {'name': '   '}, {'name': 'x' * 121}, {'stock_boxes': -1}, {'stock_boxes': 2.5}, {'stock_boxes': 'x'}, {'stock_boxes': 100001},
    {'delivery_place': ''}, {'delivery_place': 'x' * 201},
])
def test_a_round_with_bad_facts_is_refused(coop, supervisor, bad):
    assert fails(lambda: rounds.create_round(coop, supervisor, **fields(**bad)))[1] == 422
    assert SupplyRound.objects.count() == 0


def test_the_delivery_comes_after_the_deadline_and_the_harvest_after_the_delivery(coop, supervisor):
    soon = timezone.now() + timedelta(days=5)
    assert fails(lambda: rounds.create_round(coop, supervisor, **fields(request_deadline=soon, delivery_date=(soon - timedelta(days=1)).date()))) == ('bad_round', 422)
    delivery = (timezone.now() + timedelta(days=7)).date()
    assert fails(lambda: rounds.create_round(coop, supervisor, **fields(delivery_date=delivery, expected_harvest_date=delivery))) == ('bad_round', 422)


def test_opening_gives_the_round_a_lot_code_that_is_its_own(coop, supervisor):
    first = open_round(coop, supervisor)
    second = open_round(coop, supervisor)
    assert first.status == 'open' and first.lot_code and first.lot_code != second.lot_code
    assert first.lot_code.startswith('L')


def test_a_round_cannot_open_twice_or_after_its_deadline(coop, supervisor):
    rnd = rounds.create_round(coop, supervisor, **fields())
    rounds.open_round(rnd, supervisor)
    assert fails(lambda: rounds.open_round(rnd, supervisor)) == ('not_a_draft', 409)
    late = rounds.create_round(coop, supervisor, **fields(request_deadline=timezone.now() - timedelta(hours=1)))
    assert fails(lambda: rounds.open_round(late, supervisor)) == ('deadline_passed', 422)


def test_an_open_round_reads_as_closed_once_the_deadline_has_passed(coop, supervisor):
    rnd = open_round(coop, supervisor)
    assert rounds.effective_status(rnd) == 'open'
    assert rounds.effective_status(close_by_deadline(rnd)) == 'closed'


def test_a_draft_or_open_round_can_be_edited_and_an_allocated_one_cannot(coop, supervisor):
    rnd = rounds.create_round(coop, supervisor, **fields())
    rounds.edit_round(rnd, name='Renamed', stock_boxes=8)
    rnd.refresh_from_db()
    assert (rnd.name, rnd.stock_boxes) == ('Renamed', 8)
    farmer, room = farmer_with_room(coop)
    done, _ = allocated_round(coop, supervisor, [(farmer, room, 2)])
    assert fails(lambda: rounds.edit_round(done, name='Nope')) == ('not_editable', 409)


# ── asking ────────────────────────────────────────────────────────────────────

def test_a_farmer_requests_eggs_for_an_approved_room_within_their_limit(coop, supervisor):
    farmer, room = farmer_with_room(coop, boxes=3)
    rnd = open_round(coop, supervisor)
    request = rounds.submit_request(farmer, rnd, room, 3, note='For the new house')
    assert (request.status, request.boxes_asked, request.room_id, request.farm_id, request.note) == ('submitted', 3, room.pk, room.farm_id, 'For the new house')


@pytest.mark.parametrize('boxes', [0, -1, 2.5, 'x', None, True])
def test_a_request_must_be_a_whole_number_of_boxes_from_one(coop, supervisor, boxes):
    farmer, room = farmer_with_room(coop)
    assert fails(lambda: rounds.submit_request(farmer, open_round(coop, supervisor), room, boxes))[0] == 'bad_boxes'


def test_a_request_above_the_limit_is_refused_and_says_what_it_is(coop, supervisor):
    farmer, room = farmer_with_room(coop, boxes=2)
    rnd = open_round(coop, supervisor)
    code, status = fails(lambda: rounds.submit_request(farmer, rnd, room, 3))
    assert (code, status) == ('over_limit', 422)
    with pytest.raises(rounds.RoundError) as caught:
        rounds.submit_request(farmer, rnd, room, 3)
    assert 'up to 2 boxes' in caught.value.message


def test_a_request_is_limited_by_the_room_and_by_the_stock_too(coop, supervisor):
    farmer, room = farmer_with_room(coop, boxes=9, area='8')
    rnd = open_round(coop, supervisor, stock_boxes=10)
    assert fails(lambda: rounds.submit_request(farmer, rnd, room, 3))[0] == 'over_limit'
    assert rounds.submit_request(farmer, rnd, room, 2).boxes_asked == 2
    other, other_room = farmer_with_room(coop, boxes=9, area='80')
    small = open_round(coop, supervisor, stock_boxes=1)
    assert fails(lambda: rounds.submit_request(other, small, other_room, 2))[0] == 'over_limit'


def test_a_second_active_request_in_a_round_is_refused_but_a_cancelled_one_can_be_replaced(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd = open_round(coop, supervisor)
    first = rounds.submit_request(farmer, rnd, room, 2)
    assert fails(lambda: rounds.submit_request(farmer, rnd, room, 1)) == ('request_exists', 409)
    rounds.cancel_request(first, farmer)
    assert rounds.submit_request(farmer, rnd, room, 1).status == 'submitted'


def test_a_request_needs_an_open_round_before_its_deadline(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    draft = rounds.create_round(coop, supervisor, **fields())
    assert fails(lambda: rounds.submit_request(farmer, draft, room, 1)) == ('round_not_open', 409)
    late = close_by_deadline(open_round(coop, supervisor))
    assert fails(lambda: rounds.submit_request(farmer, late, room, 1)) == ('deadline_passed', 409)
    manual = open_round(coop, supervisor)
    rounds.close_round(manual)
    assert fails(lambda: rounds.submit_request(farmer, manual, room, 1)) == ('round_not_open', 409)


def test_a_paused_round_still_takes_requests(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd = open_round(coop, supervisor)
    rounds.set_paused(rnd, True)
    assert rounds.submit_request(farmer, rnd, room, 1).status == 'submitted'


def test_a_room_that_is_pending_rejected_deleted_or_somebody_elses_is_refused(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd = open_round(coop, supervisor)
    for fields_ in ({'approval_status': RearingRoom.Approval.PENDING}, {'approval_status': RearingRoom.Approval.REJECTED}, {'is_active': False}):
        RearingRoom.objects.filter(pk=room.pk).update(**fields_)
        room.refresh_from_db()
        assert fails(lambda: rounds.submit_request(farmer, rnd, room, 1)) == ('room_not_approved', 422)
        RearingRoom.objects.filter(pk=room.pk).update(approval_status='approved', is_active=True)
        room.refresh_from_db()
    other, other_room = farmer_with_room(coop)
    assert fails(lambda: rounds.submit_request(farmer, rnd, other_room, 1)) == ('room_not_found', 404)


def test_a_round_of_another_cooperative_or_a_farmer_in_none_is_not_found(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    foreign = open_round(CooperativeFactory(), UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory()))
    assert fails(lambda: rounds.submit_request(farmer, foreign, room, 1)) == ('not_found', 404)
    loner = UserFactory(role='FARMER', cooperative=None)
    loner_room = RearingRoom.objects.create(farm=FarmFactory(owner=loner), name='Room', area_m2=Decimal('20'))
    assert fails(lambda: rounds.submit_request(loner, open_round(coop, supervisor), loner_room, 1)) == ('not_found', 404)


# ── cancelling a request ──────────────────────────────────────────────────────

def test_only_the_owner_cancels_and_only_while_it_is_alive(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    other, _ = farmer_with_room(coop)
    rnd = open_round(coop, supervisor)
    request = rounds.submit_request(farmer, rnd, room, 2)
    assert fails(lambda: rounds.cancel_request(request, other)) == ('not_found', 404)
    rounds.cancel_request(request, farmer)
    request.refresh_from_db()
    assert request.status == 'cancelled'
    assert fails(lambda: rounds.cancel_request(request, farmer)) == ('nothing_to_cancel', 409)


def test_an_approved_request_can_still_be_cancelled_before_receipt_and_a_received_one_cannot(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    other, other_room = farmer_with_room(coop)
    rnd, (mine, theirs) = allocated_round(coop, supervisor, [(farmer, room, 2), (other, other_room, 2)])
    rounds.receive(theirs, supervisor, 2, 'good')
    rounds.cancel_request(mine, farmer)
    assert EggRequest.objects.get(pk=mine.pk).status == 'cancelled'
    assert fails(lambda: rounds.cancel_request(EggRequest.objects.get(pk=theirs.pk), other)) == ('nothing_to_cancel', 409)


# ── the split ─────────────────────────────────────────────────────────────────

def test_the_proposal_needs_a_closed_round(coop, supervisor):
    rnd = open_round(coop, supervisor)
    assert fails(lambda: rounds.proposal(rnd)) == ('not_closed', 409)


def test_the_proposal_gives_everyone_what_they_can_take_when_there_is_stock_for_all(coop, supervisor):
    a, room_a = farmer_with_room(coop, boxes=3)
    b, room_b = farmer_with_room(coop, boxes=2)
    rnd = open_round(coop, supervisor, stock_boxes=10)
    first = rounds.submit_request(a, rnd, room_a, 3)
    second = rounds.submit_request(b, rnd, room_b, 2)
    close_by_deadline(rnd)
    rows = rounds.proposal(rnd)
    assert [(r['id'], r['asked'], r['proposed']) for r in rows] == [(first.pk, 3, 3), (second.pk, 2, 2)]
    assert rows[0]['allowance'] == 3 and rows[0]['room_free'] == 5 and rows[0]['farmer']['name'] == a.name


def test_the_proposal_shares_a_short_stock_in_order_of_request_for_ties(coop, supervisor):
    farmers = [farmer_with_room(coop, boxes=2) for _ in range(3)]
    rnd = open_round(coop, supervisor, stock_boxes=4)
    made = [rounds.submit_request(f, rnd, r, 2) for f, r in farmers]
    rounds.close_round(rnd)
    assert [r['proposed'] for r in rounds.proposal(rnd)] == [2, 1, 1]
    assert [r['id'] for r in rounds.proposal(rnd)] == [q.pk for q in made]


def test_the_proposal_counts_the_allowance_at_the_deadline_not_at_the_request(coop, supervisor):
    farmer, room = farmer_with_room(coop, boxes=3)
    rnd = open_round(coop, supervisor, stock_boxes=10)
    rounds.submit_request(farmer, rnd, room, 3)
    allowance.lower(farmer, 1, 'Outbreak last month', by=supervisor)
    rounds.close_round(rnd)
    assert rounds.proposal(rnd)[0]['proposed'] == 1


def test_a_request_whose_room_lost_approval_or_whose_farmer_left_proposes_nothing(coop, supervisor):
    a, room_a = farmer_with_room(coop)
    b, room_b = farmer_with_room(coop)
    rnd = open_round(coop, supervisor)
    rounds.submit_request(a, rnd, room_a, 2)
    rounds.submit_request(b, rnd, room_b, 2)
    RearingRoom.objects.filter(pk=room_a.pk).update(approval_status='rejected')
    b.cooperative = None
    b.save()
    rounds.close_round(rnd)
    assert [r['proposed'] for r in rounds.proposal(rnd)] == [0, 0]


# ── confirming ────────────────────────────────────────────────────────────────

def make_closed(coop, supervisor, asks, stock=10):
    rnd = open_round(coop, supervisor, stock_boxes=stock)
    made = []
    for boxes, allowance_boxes in asks:
        farmer, room = farmer_with_room(coop, boxes=allowance_boxes)
        made.append(rounds.submit_request(farmer, rnd, room, boxes))
    rounds.close_round(rnd)
    return rnd, made


def test_confirming_writes_each_result_and_allocates_the_round(coop, supervisor):
    rnd, (full, part, waiting, no) = make_closed(coop, supervisor, [(2, 3), (3, 3), (1, 3), (1, 3)], stock=10)
    rounds.confirm(rnd, supervisor, [
        {'id': full.pk, 'boxes': 2}, {'id': part.pk, 'boxes': 1}, {'id': waiting.pk, 'boxes': 0},
        {'id': no.pk, 'boxes': 0, 'decline_note': 'Rooms are full'},
    ])
    rnd.refresh_from_db()
    results = {q.pk: EggRequest.objects.get(pk=q.pk) for q in (full, part, waiting, no)}
    assert (rnd.status, rnd.allocated_at is not None) == ('allocated', True)
    assert [(results[q.pk].status, results[q.pk].boxes_approved) for q in (full, part, waiting, no)] == [
        ('approved', 2), ('part_approved', 1), ('waitlisted', 0), ('declined', 0),
    ]
    assert results[no.pk].decision_note == 'Rooms are full'
    assert all(r.decided_by_id == supervisor.pk and r.decided_at for r in results.values())


def test_the_total_may_not_pass_the_stock_nor_a_request_pass_what_was_asked(coop, supervisor):
    rnd, (a, b) = make_closed(coop, supervisor, [(3, 3), (3, 3)], stock=4)
    assert fails(lambda: rounds.confirm(rnd, supervisor, [{'id': a.pk, 'boxes': 3}, {'id': b.pk, 'boxes': 3}])) == ('over_stock', 422)
    assert fails(lambda: rounds.confirm(rnd, supervisor, [{'id': a.pk, 'boxes': 4}, {'id': b.pk, 'boxes': 0}])) == ('over_asked', 422)
    assert SupplyRound.objects.get(pk=rnd.pk).status == 'closed'
    assert EggRequest.objects.filter(status='submitted').count() == 2


def test_every_waiting_request_must_be_in_the_confirmation(coop, supervisor):
    rnd, (a, b) = make_closed(coop, supervisor, [(1, 3), (1, 3)])
    assert fails(lambda: rounds.confirm(rnd, supervisor, [{'id': a.pk, 'boxes': 1}])) == ('incomplete', 422)
    assert fails(lambda: rounds.confirm(rnd, supervisor, [{'id': a.pk, 'boxes': 1}, {'id': 'nope', 'boxes': 1}])) == ('incomplete', 422)


def test_a_round_that_is_still_open_cannot_be_confirmed(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd = open_round(coop, supervisor)
    request = rounds.submit_request(farmer, rnd, room, 1)
    assert fails(lambda: rounds.confirm(rnd, supervisor, [{'id': request.pk, 'boxes': 1}])) == ('not_closed', 409)


def test_a_round_whose_deadline_passed_can_be_confirmed_without_closing_it_by_hand(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd = open_round(coop, supervisor)
    request = rounds.submit_request(farmer, rnd, room, 1)
    close_by_deadline(rnd)
    rounds.confirm(rnd, supervisor, [{'id': request.pk, 'boxes': 1}])
    assert SupplyRound.objects.get(pk=rnd.pk).status == 'allocated'


def test_the_second_supervisor_to_confirm_loses(coop, supervisor):
    rnd, (a,) = make_closed(coop, supervisor, [(1, 3)])
    rounds.confirm(rnd, supervisor, [{'id': a.pk, 'boxes': 1}])
    assert fails(lambda: rounds.confirm(rnd, supervisor, [{'id': a.pk, 'boxes': 0}])) == ('already_allocated', 409)
    assert EggRequest.objects.get(pk=a.pk).status == 'approved'


def test_a_cancelled_request_is_left_out_of_the_split(coop, supervisor):
    rnd, (a, b) = make_closed(coop, supervisor, [(1, 3), (1, 3)])
    rounds.cancel_request(b, b.farmer)
    assert [r['id'] for r in rounds.proposal(rnd)] == [a.pk]
    rounds.confirm(rnd, supervisor, [{'id': a.pk, 'boxes': 1}])
    assert EggRequest.objects.get(pk=b.pk).status == 'cancelled'


# ── receiving ─────────────────────────────────────────────────────────────────

def test_receiving_makes_one_batch_in_the_room_at_the_egg_stage_with_the_lot_code(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd, (request,) = allocated_round(coop, supervisor, [(farmer, room, 3)])
    batch = rounds.receive(request, farmer, 3, 'good')
    request.refresh_from_db()
    assert (batch.farm_id, batch.room_id, batch.stage, batch.quantity, batch.quantity_unit, batch.lot_code) == (room.farm_id, room.pk, 'EGG', 3, 'BOXES', rnd.lot_code)
    assert batch.expected_harvest_date.date() == rnd.expected_harvest_date
    assert (request.status, request.boxes_received, request.condition, request.received_by_id, request.batch_id) == ('received', 3, 'good', farmer.pk, batch.pk)
    assert request.received_at is not None
    assert batch.room_stays.filter(room=room, ended_at__isnull=True).count() == 1


def test_a_partial_delivery_is_received_as_what_arrived(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd, (request,) = allocated_round(coop, supervisor, [(farmer, room, 3)])
    batch = rounds.receive(request, supervisor, 2, 'damaged')
    request.refresh_from_db()
    assert (batch.quantity, request.boxes_received, request.condition, request.received_by_id) == (2, 2, 'damaged', supervisor.pk)


@pytest.mark.parametrize('boxes,condition,code', [(0, 'good', 'bad_boxes'), (4, 'good', 'over_approved'), (2.5, 'good', 'bad_boxes'), (2, 'wet', 'bad_condition'), (2, '', 'bad_condition')])
def test_receipt_refuses_a_bad_quantity_or_condition(coop, supervisor, boxes, condition, code):
    farmer, room = farmer_with_room(coop)
    rnd, (request,) = allocated_round(coop, supervisor, [(farmer, room, 3)])
    assert fails(lambda: rounds.receive(request, farmer, boxes, condition))[0] == code
    assert Batch.objects.count() == 0


def test_two_taps_make_one_batch_and_the_second_is_told(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd, (request,) = allocated_round(coop, supervisor, [(farmer, room, 3)])
    rounds.receive(request, farmer, 3, 'good')
    assert fails(lambda: rounds.receive(request, supervisor, 3, 'good')) == ('already_received', 409)
    assert Batch.objects.count() == 1


def test_nothing_can_be_received_in_a_paused_cancelled_or_not_yet_allocated_round(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd, (request,) = allocated_round(coop, supervisor, [(farmer, room, 3)])
    rounds.set_paused(rnd, True)
    assert fails(lambda: rounds.receive(request, farmer, 3, 'good')) == ('round_paused', 409)
    rounds.set_paused(rnd, False)
    other, other_room = farmer_with_room(coop)
    open_one = open_round(coop, supervisor)
    waiting = rounds.submit_request(other, open_one, other_room, 1)
    assert fails(lambda: rounds.receive(waiting, other, 1, 'good'))[0] == 'not_approved'
    rounds.cancel_round(rnd, supervisor, 'No eggs came')
    assert fails(lambda: rounds.receive(EggRequest.objects.get(pk=request.pk), farmer, 3, 'good'))[0] in ('not_approved', 'round_not_delivering')
    assert Batch.objects.count() == 0


def test_a_room_that_lost_approval_after_the_request_cannot_take_the_batch(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd, (request,) = allocated_round(coop, supervisor, [(farmer, room, 3)])
    RearingRoom.objects.filter(pk=room.pk).update(approval_status='rejected')
    assert fails(lambda: rounds.receive(request, farmer, 3, 'good')) == ('room_not_approved', 409)
    assert EggRequest.objects.get(pk=request.pk).status == 'approved'
    assert Batch.objects.count() == 0


def test_a_waitlisted_or_declined_request_has_nothing_to_receive(coop, supervisor):
    a, room_a = farmer_with_room(coop)
    b, room_b = farmer_with_room(coop)
    rnd = open_round(coop, supervisor)
    waiting = rounds.submit_request(a, rnd, room_a, 1)
    declined = rounds.submit_request(b, rnd, room_b, 1)
    rounds.close_round(rnd)
    rounds.confirm(rnd, supervisor, [{'id': waiting.pk, 'boxes': 0}, {'id': declined.pk, 'boxes': 0, 'decline_note': 'No room'}])
    assert fails(lambda: rounds.receive(EggRequest.objects.get(pk=waiting.pk), a, 1, 'good')) == ('not_approved', 409)
    assert fails(lambda: rounds.receive(EggRequest.objects.get(pk=declined.pk), b, 1, 'good')) == ('not_approved', 409)


def test_not_collected_is_marked_by_hand_and_only_for_an_approved_request(coop, supervisor):
    farmer, room = farmer_with_room(coop)
    rnd, (request,) = allocated_round(coop, supervisor, [(farmer, room, 2)])
    rounds.mark_not_collected(request, supervisor)
    assert EggRequest.objects.get(pk=request.pk).status == 'not_collected'
    assert fails(lambda: rounds.mark_not_collected(EggRequest.objects.get(pk=request.pk), supervisor)) == ('not_approved', 409)


def test_the_round_is_done_when_every_promise_is_received_or_not_collected(coop, supervisor):
    a, room_a = farmer_with_room(coop)
    b, room_b = farmer_with_room(coop)
    rnd, (first, second) = allocated_round(coop, supervisor, [(a, room_a, 2), (b, room_b, 2)])
    rounds.receive(first, a, 2, 'good')
    assert SupplyRound.objects.get(pk=rnd.pk).status == 'allocated'
    rounds.mark_not_collected(EggRequest.objects.get(pk=second.pk), supervisor)
    assert SupplyRound.objects.get(pk=rnd.pk).status == 'done'


# ── cancelling, pausing, leaving ──────────────────────────────────────────────

def test_cancelling_a_round_cancels_its_waiting_requests_with_the_reason_and_keeps_what_was_received(coop, supervisor):
    a, room_a = farmer_with_room(coop)
    b, room_b = farmer_with_room(coop)
    rnd, (first, second) = allocated_round(coop, supervisor, [(a, room_a, 2), (b, room_b, 2)])
    rounds.receive(first, a, 2, 'good')
    affected = rounds.cancel_round(rnd, supervisor, 'No eggs this month')
    assert [q.pk for q in affected] == [second.pk]
    assert EggRequest.objects.get(pk=second.pk).status == 'cancelled'
    assert EggRequest.objects.get(pk=second.pk).decision_note == 'No eggs this month'
    assert EggRequest.objects.get(pk=first.pk).status == 'received'
    assert SupplyRound.objects.get(pk=rnd.pk).status == 'cancelled'


def test_cancelling_needs_a_reason_and_cannot_be_done_twice(coop, supervisor):
    rnd = open_round(coop, supervisor)
    assert fails(lambda: rounds.cancel_round(rnd, supervisor, '  ')) == ('note_required', 422)
    rounds.cancel_round(rnd, supervisor, 'Plans changed')
    assert fails(lambda: rounds.cancel_round(rnd, supervisor, 'Again')) == ('not_cancellable', 409)


def test_a_draft_cannot_be_paused_and_a_round_can_be_resumed(coop, supervisor):
    draft = rounds.create_round(coop, supervisor, **fields())
    assert fails(lambda: rounds.set_paused(draft, True)) == ('not_pausable', 409)
    rnd = open_round(coop, supervisor)
    rounds.set_paused(rnd, True)
    assert SupplyRound.objects.get(pk=rnd.pk).paused is True
    rounds.set_paused(rnd, False)
    assert SupplyRound.objects.get(pk=rnd.pk).paused is False


def test_editing_the_stock_after_requests_changes_what_the_proposal_can_share(coop, supervisor):
    a, room_a = farmer_with_room(coop, boxes=3)
    rnd = open_round(coop, supervisor, stock_boxes=10)
    rounds.submit_request(a, rnd, room_a, 3)
    rounds.edit_round(rnd, stock_boxes=2)
    rounds.close_round(rnd)
    assert rounds.proposal(rnd)[0]['proposed'] == 2
