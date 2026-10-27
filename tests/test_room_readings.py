"""A reading belongs to the room it was taken in. The readings of a batch are those of the rooms it stayed in."""
from datetime import timedelta

import pytest
from django.utils import timezone

from batches.models import Batch, BatchRoomStay
from batches.placement import leave_room, place_batch
from batches.queries import with_counts
from core.access import scope_readings
from farms.models import RearingRoom
from sensors.models import SensorReading
from sensors.room_readings import readings_for_batch
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

NOW = timezone.now()


def ago(hours):
    return NOW - timedelta(hours=hours)


@pytest.fixture
def farm():
    return FarmFactory()


def room(farm, name):
    return RearingRoom.objects.create(farm=farm, name=name)


def reading(room_, hours_ago, temperature=25.0, **kw):
    row = SensorReading.objects.create(room=room_, temperature=temperature, humidity=78.0, **kw)
    SensorReading.objects.filter(pk=row.pk).update(timestamp=ago(hours_ago))
    return row.pk


def placed(farm, room_, started_hours_ago):
    batch = BatchFactory(farm=farm)
    place_batch(batch, room_, when=ago(started_hours_ago))
    return batch


def ids(batch):
    return set(readings_for_batch(batch).values_list('pk', flat=True))


def test_a_batch_has_the_readings_of_its_room_from_the_day_it_arrived(farm):
    a = room(farm, 'Room A')
    batch = placed(farm, a, started_hours_ago=10)
    before = reading(a, 12)
    during = reading(a, 5)
    assert ids(batch) == {during}
    assert before not in ids(batch)


def test_readings_of_another_room_never_count(farm):
    a, b = room(farm, 'Room A'), room(farm, 'Room B')
    batch = placed(farm, a, 10)
    reading(b, 5)
    assert ids(batch) == set()


def test_two_batches_in_one_room_share_its_readings(farm):
    a = room(farm, 'Room A')
    first, second = placed(farm, a, 10), placed(farm, a, 10)
    shared = reading(a, 3)
    assert ids(first) == ids(second) == {shared}


def test_a_batch_that_moved_has_each_rooms_readings_only_while_it_was_there(farm):
    a, b = room(farm, 'Room A'), room(farm, 'Room B')
    batch = placed(farm, a, 20)
    in_a_before_move = reading(a, 15)
    in_b_before_move = reading(b, 15)
    place_batch(batch, b, when=ago(10))
    in_a_after_move = reading(a, 5)
    in_b_after_move = reading(b, 5)
    assert ids(batch) == {in_a_before_move, in_b_after_move}
    assert in_b_before_move not in ids(batch)
    assert in_a_after_move not in ids(batch)


def test_a_reading_at_the_very_moment_of_the_move_belongs_to_the_new_room(farm):
    a, b = room(farm, 'Room A'), room(farm, 'Room B')
    batch = placed(farm, a, 20)
    place_batch(batch, b, when=ago(10))
    in_a = reading(a, 10)
    in_b = reading(b, 10)
    assert ids(batch) == {in_b}
    assert in_a not in ids(batch)


def test_a_batch_that_went_back_to_a_room_has_both_visits(farm):
    a, b = room(farm, 'Room A'), room(farm, 'Room B')
    batch = placed(farm, a, 30)
    place_batch(batch, b, when=ago(20))
    place_batch(batch, a, when=ago(10))
    first_visit, away, second_visit = reading(a, 25), reading(a, 15), reading(a, 5)
    assert ids(batch) == {first_visit, second_visit}
    assert away not in ids(batch)


def test_a_deleted_batch_keeps_the_readings_of_the_time_it_was_there(farm):
    a = room(farm, 'Room A')
    batch = placed(farm, a, 20)
    during, after = reading(a, 12), reading(a, 2)
    leave_room(batch, when=ago(6))
    assert ids(batch) == {during}
    assert after not in ids(batch)


def test_readings_made_before_rooms_still_count_for_their_batch(farm):
    batch = BatchFactory(farm=farm)
    legacy = SensorReading.objects.create(batch=batch, temperature=24.0, humidity=70.0)
    other = BatchFactory(farm=farm)
    SensorReading.objects.create(batch=other, temperature=24.0, humidity=70.0)
    assert ids(batch) == {legacy.pk}


def test_a_batch_that_was_never_placed_has_only_its_legacy_readings(farm):
    a = room(farm, 'Room A')
    reading(a, 3)
    assert ids(BatchFactory(farm=farm)) == set()


def test_the_count_on_a_batch_list_matches_the_readings_it_really_has(farm):
    a, b = room(farm, 'Room A'), room(farm, 'Room B')
    moved = placed(farm, a, 20)
    reading(a, 15)
    reading(b, 15)
    place_batch(moved, b, when=ago(10))
    reading(b, 5)
    reading(a, 5)
    legacy = BatchFactory(farm=farm)
    SensorReading.objects.create(batch=legacy, temperature=24.0, humidity=70.0)
    counted = {b_.pk: b_.reading_total for b_ in with_counts(Batch.objects.filter(farm=farm))}
    assert counted[moved.pk] == 2 == len(ids(moved))
    assert counted[legacy.pk] == 1


# ── who may see a reading ───────────────────────────────────────────────────

def scoped(user):
    return set(scope_readings(user, SensorReading.objects.all()).values_list('pk', flat=True))


def test_a_farmer_sees_the_readings_of_their_own_rooms_only():
    owner = UserFactory(role='FARMER')
    mine = reading(room(FarmFactory(owner=owner), 'Room A'), 1)
    reading(room(FarmFactory(), 'Room A'), 1)
    assert scoped(owner) == {mine}


def test_a_supervisor_sees_the_rooms_of_their_cooperative_and_nothing_without_one():
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    inside = reading(room(FarmFactory(owner=farmer), 'Room A'), 1)
    reading(room(FarmFactory(owner=UserFactory(role='FARMER', cooperative=CooperativeFactory())), 'Room A'), 1)
    assert scoped(UserFactory(role='SUPERVISOR', cooperative=coop)) == {inside}
    assert scoped(UserFactory(role='SUPERVISOR')) == set()


def test_an_admin_sees_every_live_room():
    one, two = reading(room(FarmFactory(), 'A'), 1), reading(room(FarmFactory(), 'B'), 1)
    assert scoped(UserFactory(role='ADMIN')) == {one, two}


def test_the_readings_of_a_deleted_room_or_farm_are_hidden_from_everyone():
    owner = UserFactory(role='FARMER')
    farm = FarmFactory(owner=owner)
    gone_room = room(farm, 'Old')
    reading(gone_room, 1)
    RearingRoom.objects.filter(pk=gone_room.pk).update(is_active=False)
    dead_farm = FarmFactory(owner=owner, is_active=False)
    reading(room(dead_farm, 'Room'), 1)
    assert scoped(owner) == set()
    assert scoped(UserFactory(role='ADMIN')) == set()


def test_legacy_readings_are_seen_through_their_batch_by_the_same_rules():
    owner = UserFactory(role='FARMER')
    mine = SensorReading.objects.create(batch=BatchFactory(farm=FarmFactory(owner=owner)), temperature=24.0, humidity=70.0)
    SensorReading.objects.create(batch=BatchFactory(), temperature=24.0, humidity=70.0)
    SensorReading.objects.create(batch=BatchFactory(farm=FarmFactory(owner=owner), is_active=False), temperature=24.0, humidity=70.0)
    assert scoped(owner) == {mine.pk}


def test_stays_are_what_decide_not_the_batch_row(farm):
    """Moving rows around in BatchRoomStay is enough to change which readings a batch has."""
    a = room(farm, 'Room A')
    batch = placed(farm, a, 10)
    row = reading(a, 5)
    assert ids(batch) == {row}
    BatchRoomStay.objects.filter(batch=batch).update(ended_at=ago(8))
    assert ids(batch) == set()
