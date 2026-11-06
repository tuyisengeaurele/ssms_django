"""A room has an approval state and a size. A room made the old way, and every room that exists today, stays approved.

The model default is `approved` on purpose: rooms made by code (and every older test) are usable, and only the farmer's
create path sets `pending` (see farms/room_review.py).
"""
from decimal import Decimal
from importlib import import_module

import pytest
from django.db.migrations import AddField

from farms.models import AREA_MAX, AREA_MIN, RearingRoom
from tests.factories import FarmFactory

pytestmark = pytest.mark.django_db

Approval = RearingRoom.Approval


def room(**fields):
    return RearingRoom.objects.create(farm=FarmFactory(), name='A', **fields)


def test_a_room_made_the_old_way_is_approved_and_usable():
    made = room()
    assert made.approval_status == Approval.APPROVED
    assert made.usable is True and made.needs_review is False
    assert made.area_m2 is None and made.pending_area_m2 is None
    assert made.review_note == '' and made.reviewed_by is None and made.reviewed_at is None


def test_a_pending_room_needs_review_and_is_not_usable():
    made = room(approval_status=Approval.PENDING, area_m2=Decimal('12.50'))
    assert made.usable is False and made.needs_review is True


def test_a_rejected_room_is_not_usable_and_needs_no_review():
    made = room(approval_status=Approval.REJECTED, review_note='Too small for the batch')
    assert made.usable is False and made.needs_review is False


def test_an_approved_room_with_a_queued_size_needs_review_and_is_still_usable():
    made = room(area_m2=Decimal('10'), pending_area_m2=Decimal('20'))
    assert made.usable is True and made.needs_review is True


def test_the_size_survives_a_round_trip_with_two_places():
    made = room(area_m2=Decimal('12.5'))
    made.refresh_from_db()
    assert made.area_m2 == Decimal('12.50')


def test_the_size_limits_are_one_to_five_thousand_square_metres():
    assert (AREA_MIN, AREA_MAX) == (Decimal('1'), Decimal('5000'))


def test_the_migration_gives_every_existing_room_the_approved_state():
    # Django fills a new column on existing rows with the field's default, so that default is what keeps today's rooms usable.
    migration = import_module('farms.migrations.0005_room_approval').Migration
    added = {op.name: op.field for op in migration.operations if isinstance(op, AddField) and op.model_name == 'rearingroom'}
    assert added['approval_status'].default == 'approved'
    assert {'reviewed_by', 'reviewed_at', 'review_note', 'area_m2', 'pending_area_m2'} <= set(added)
