"""The rules of room approval: how a room gets its state, how a reviewer decides, and who is asked.

`farms/room_review.py` is the only code that changes the state, so the views and the emails only ask it.
"""
from decimal import Decimal

import pytest

from farms import room_review
from farms.models import RearingRoom
from farms.room_review import ReviewError
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

Approval = RearingRoom.Approval


def world():
    """A cooperative with a supervisor and a farmer, and the farmer's farm."""
    coop = CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    farmer = UserFactory(role='FARMER', cooperative=coop)
    return coop, supervisor, farmer, FarmFactory(owner=farmer)


def make(farm, name='A', **fields):
    return RearingRoom.objects.create(farm=farm, name=name, **fields)


def code_of(call):
    with pytest.raises(ReviewError) as refused:
        call()
    return refused.value.code, refused.value.status


# ── how a new room gets its state ─────────────────────────────────────────────

def test_a_farmers_new_room_waits_for_a_reviewer():
    _, _, farmer, farm = world()
    room = make(farm, area_m2=Decimal('12'))
    room_review.open_new(room, farmer)
    room.refresh_from_db()
    assert room.approval_status == Approval.PENDING and room.reviewed_by is None


def test_a_room_made_by_an_admin_is_approved_at_once():
    _, _, _, farm = world()
    admin = UserFactory(role='ADMIN')
    room = make(farm, area_m2=Decimal('12'))
    room_review.open_new(room, admin)
    room.refresh_from_db()
    assert room.approval_status == Approval.APPROVED and room.reviewed_by_id == admin.pk and room.reviewed_at is not None


# ── a change of size ──────────────────────────────────────────────────────────

def test_a_new_size_for_an_approved_room_is_queued_and_the_old_one_stays_in_force():
    _, _, farmer, farm = world()
    room = make(farm, area_m2=Decimal('10'))
    assert room_review.change_area(room, Decimal('20'), farmer) == 'queued'
    room.refresh_from_db()
    assert (room.area_m2, room.pending_area_m2) == (Decimal('10.00'), Decimal('20.00'))
    assert room.usable is True and room.needs_review is True


def test_a_second_new_size_replaces_the_queued_one():
    _, _, farmer, farm = world()
    room = make(farm, area_m2=Decimal('10'))
    room_review.change_area(room, Decimal('20'), farmer)
    assert room_review.change_area(room, Decimal('30'), farmer) == 'queued'
    room.refresh_from_db()
    assert room.pending_area_m2 == Decimal('30.00')


def test_a_room_approved_before_sizes_existed_queues_its_first_size_too():
    # Otherwise a farmer could set any size on an old room without a reviewer ever looking at it.
    _, _, farmer, farm = world()
    room = make(farm)
    assert room_review.change_area(room, Decimal('15'), farmer) == 'queued'
    room.refresh_from_db()
    assert room.area_m2 is None and room.pending_area_m2 == Decimal('15.00')


def test_the_same_size_changes_nothing():
    _, _, farmer, farm = world()
    room = make(farm, area_m2=Decimal('10'))
    assert room_review.change_area(room, Decimal('10'), farmer) == 'unchanged'
    room.refresh_from_db()
    assert room.pending_area_m2 is None


def test_a_pending_room_just_takes_the_new_size():
    _, _, farmer, farm = world()
    room = make(farm, approval_status=Approval.PENDING, area_m2=Decimal('10'))
    assert room_review.change_area(room, Decimal('14'), farmer) == 'updated'
    room.refresh_from_db()
    assert (room.area_m2, room.approval_status, room.pending_area_m2) == (Decimal('14.00'), Approval.PENDING, None)


def test_a_rejected_room_is_resubmitted_by_giving_a_new_size_and_keeps_its_note_until_the_next_decision():
    _, _, farmer, farm = world()
    room = make(farm, approval_status=Approval.REJECTED, area_m2=Decimal('4'), review_note='Too small for a batch')
    assert room_review.change_area(room, Decimal('9'), farmer) == 'resubmitted'
    room.refresh_from_db()
    assert (room.approval_status, room.area_m2, room.review_note) == (Approval.PENDING, Decimal('9.00'), 'Too small for a batch')


def test_an_admin_changes_the_size_of_an_approved_room_directly():
    _, _, _, farm = world()
    admin = UserFactory(role='ADMIN')
    room = make(farm, area_m2=Decimal('10'))
    assert room_review.change_area(room, Decimal('25'), admin) == 'updated'
    room.refresh_from_db()
    assert (room.area_m2, room.pending_area_m2) == (Decimal('25.00'), None)


# ── deciding ──────────────────────────────────────────────────────────────────

def test_approving_a_new_room():
    _, supervisor, _, farm = world()
    room = make(farm, approval_status=Approval.PENDING, area_m2=Decimal('12'))
    decided = room_review.decide(room, supervisor, 'approve')
    assert decided.approval_status == Approval.APPROVED and decided.usable
    assert decided.reviewed_by_id == supervisor.pk and decided.reviewed_at is not None


def test_approving_a_queued_size_makes_it_the_size():
    _, supervisor, _, farm = world()
    room = make(farm, area_m2=Decimal('10'), pending_area_m2=Decimal('20'))
    decided = room_review.decide(room, supervisor, 'approve', 'Checked on site')
    assert (decided.area_m2, decided.pending_area_m2) == (Decimal('20.00'), None)
    assert decided.review_note == 'Checked on site'


def test_rejecting_a_new_room_keeps_the_reason():
    _, supervisor, _, farm = world()
    room = make(farm, approval_status=Approval.PENDING, area_m2=Decimal('2'))
    decided = room_review.decide(room, supervisor, 'reject', 'Too small for a batch')
    assert decided.approval_status == Approval.REJECTED and decided.usable is False
    assert decided.review_note == 'Too small for a batch'


def test_rejecting_a_queued_size_clears_it_and_leaves_the_room_approved_at_the_old_size():
    _, supervisor, _, farm = world()
    room = make(farm, area_m2=Decimal('10'), pending_area_m2=Decimal('400'))
    decided = room_review.decide(room, supervisor, 'reject', 'That is not the size of this room')
    assert (decided.approval_status, decided.area_m2, decided.pending_area_m2) == (Approval.APPROVED, Decimal('10.00'), None)
    assert decided.review_note == 'That is not the size of this room'


@pytest.mark.parametrize('note', ['', '   ', None])
def test_a_rejection_needs_a_note(note):
    _, supervisor, _, farm = world()
    room = make(farm, approval_status=Approval.PENDING, area_m2=Decimal('2'))
    assert code_of(lambda: room_review.decide(room, supervisor, 'reject', note)) == ('note_required', 422)
    room.refresh_from_db()
    assert room.approval_status == Approval.PENDING


def test_a_room_with_nothing_to_review_cannot_be_decided():
    _, supervisor, _, farm = world()
    approved = make(farm, 'Fine')
    rejected = make(farm, 'No', approval_status=Approval.REJECTED)
    assert code_of(lambda: room_review.decide(approved, supervisor, 'approve')) == ('nothing_to_review', 409)
    assert code_of(lambda: room_review.decide(rejected, supervisor, 'approve')) == ('nothing_to_review', 409)


def test_the_second_of_two_decisions_on_the_same_room_loses():
    coop, supervisor, _, farm = world()
    other = UserFactory(role='SUPERVISOR', cooperative=coop)
    room = make(farm, approval_status=Approval.PENDING, area_m2=Decimal('12'))
    stale = RearingRoom.objects.get(pk=room.pk)   # the second reviewer opened the room before the first decided
    room_review.decide(room, supervisor, 'approve')
    assert code_of(lambda: room_review.decide(stale, other, 'reject', 'Too late')) == ('nothing_to_review', 409)
    room.refresh_from_db()
    assert room.approval_status == Approval.APPROVED and room.reviewed_by_id == supervisor.pk


def test_an_unknown_decision_is_refused():
    _, supervisor, _, farm = world()
    room = make(farm, approval_status=Approval.PENDING, area_m2=Decimal('12'))
    assert code_of(lambda: room_review.decide(room, supervisor, 'maybe')) == ('bad_decision', 400)


# ── who is asked ──────────────────────────────────────────────────────────────

def test_the_supervisors_of_the_farmers_cooperative_review_it_and_nobody_else():
    coop, supervisor, _, farm = world()
    second = UserFactory(role='SUPERVISOR', cooperative=coop)
    UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())
    UserFactory(role='ADMIN')
    room = make(farm, approval_status=Approval.PENDING)
    assert {u.pk for u in room_review.reviewers_for(room)} == {supervisor.pk, second.pk}


def test_an_inactive_supervisor_is_skipped():
    coop, supervisor, _, farm = world()
    UserFactory(role='SUPERVISOR', cooperative=coop, is_active=False)
    room = make(farm, approval_status=Approval.PENDING)
    assert [u.pk for u in room_review.reviewers_for(room)] == [supervisor.pk]


def test_a_cooperative_with_no_supervisor_goes_to_every_active_admin():
    coop = CooperativeFactory()
    farm = FarmFactory(owner=UserFactory(role='FARMER', cooperative=coop))
    first, second = UserFactory(role='ADMIN'), UserFactory(role='ADMIN')
    UserFactory(role='ADMIN', is_active=False)
    room = make(farm, approval_status=Approval.PENDING)
    assert {u.pk for u in room_review.reviewers_for(room)} == {first.pk, second.pk}


def test_a_farmer_in_no_cooperative_goes_to_the_admins():
    farm = FarmFactory(owner=UserFactory(role='FARMER', cooperative=None))
    admin = UserFactory(role='ADMIN')
    UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())
    room = make(farm, approval_status=Approval.PENDING)
    assert [u.pk for u in room_review.reviewers_for(room)] == [admin.pk]


# ── the list a reviewer sees ──────────────────────────────────────────────────

def test_a_supervisor_sees_the_waiting_rooms_of_their_cooperative_only():
    _, supervisor, _, farm = world()
    new = make(farm, 'New', approval_status=Approval.PENDING)
    resized = make(farm, 'Resized', area_m2=Decimal('10'), pending_area_m2=Decimal('20'))
    make(farm, 'Fine')
    make(farm, 'Refused', approval_status=Approval.REJECTED)
    elsewhere = FarmFactory(owner=UserFactory(role='FARMER', cooperative=CooperativeFactory()))
    make(elsewhere, 'Not mine', approval_status=Approval.PENDING)
    assert {r.pk for r in room_review.waiting_for(supervisor)} == {new.pk, resized.pk}


def test_an_admin_sees_every_waiting_room_and_can_narrow_to_one_cooperative():
    coop, _, _, farm = world()
    admin = UserFactory(role='ADMIN')
    mine = make(farm, approval_status=Approval.PENDING)
    other_coop = CooperativeFactory()
    other = make(FarmFactory(owner=UserFactory(role='FARMER', cooperative=other_coop)), approval_status=Approval.PENDING)
    none = make(FarmFactory(owner=UserFactory(role='FARMER', cooperative=None)), approval_status=Approval.PENDING)
    assert {r.pk for r in room_review.waiting_for(admin)} == {mine.pk, other.pk, none.pk}
    assert {r.pk for r in room_review.waiting_for(admin, coop.pk)} == {mine.pk}


def test_a_deleted_room_and_the_room_of_a_deleted_farm_are_left_out():
    _, supervisor, farmer, farm = world()
    make(farm, 'Gone', approval_status=Approval.PENDING, is_active=False)
    closed = FarmFactory(owner=farmer, is_active=False)
    make(closed, 'On a closed farm', approval_status=Approval.PENDING)
    assert list(room_review.waiting_for(supervisor)) == []


def test_the_newest_waiting_room_comes_first():
    _, supervisor, _, farm = world()
    first = make(farm, 'First', approval_status=Approval.PENDING)
    second = make(farm, 'Second', approval_status=Approval.PENDING)
    assert [r.pk for r in room_review.waiting_for(supervisor)] == [second.pk, first.pk]
