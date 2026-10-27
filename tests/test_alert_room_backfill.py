"""Open alerts that were kept per batch before rooms are given their batch's room, and it can be run again safely."""
import pytest
from django.apps import apps
from django.utils import timezone

from alerts.models import AlertLog
from alerts.room_backfill import backfill
from batches.placement import leave_room, place_batch
from farms.models import RearingRoom
from tests.factories import BatchFactory, FarmFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def room():
    return RearingRoom.objects.create(farm=FarmFactory(), name='Room 1')


def make(batch, type_='TEMPERATURE', **kw):
    return AlertLog.objects.create(batch=batch, type=type_, message='x', **kw)


def test_an_open_problem_alert_gets_the_room_of_its_batch_and_keeps_its_batch(room):
    batch = BatchFactory(farm=room.farm)
    place_batch(batch, room)
    alert = make(batch)
    backfill(apps)
    alert.refresh_from_db()
    assert (alert.room_id, alert.batch_id) == (room.pk, batch.pk)


@pytest.mark.parametrize('type_', ['TEMPERATURE', 'HUMIDITY', 'SYSTEM'])
def test_every_kind_a_room_now_owns_is_covered(room, type_):
    batch = BatchFactory(farm=room.farm)
    place_batch(batch, room)
    alert = make(batch, type_)
    backfill(apps)
    alert.refresh_from_db()
    assert alert.room_id == room.pk


def test_alerts_about_one_batch_stay_with_the_batch(room):
    batch = BatchFactory(farm=room.farm)
    place_batch(batch, room)
    stage, disease = make(batch, 'STAGE_CHANGE'), make(batch, 'DISEASE')
    backfill(apps)
    for alert in (stage, disease):
        alert.refresh_from_db()
        assert alert.room_id is None


def test_a_resolved_alert_is_history_and_is_left_alone(room):
    batch = BatchFactory(farm=room.farm)
    place_batch(batch, room)
    alert = make(batch, resolved_at=timezone.now())
    backfill(apps)
    alert.refresh_from_db()
    assert alert.room_id is None


def test_a_batch_without_a_room_leaves_its_alert_as_it_is():
    alert = make(BatchFactory())
    backfill(apps)
    alert.refresh_from_db()
    assert alert.room_id is None


def test_the_alert_of_a_deleted_batch_is_left_as_it_is(room):
    batch = BatchFactory(farm=room.farm)
    place_batch(batch, room)
    leave_room(batch)
    alert = make(batch)
    backfill(apps)
    alert.refresh_from_db()
    assert alert.room_id is None


def test_running_it_twice_changes_nothing_more(room):
    batch = BatchFactory(farm=room.farm)
    place_batch(batch, room)
    make(batch)
    backfill(apps)
    before = list(AlertLog.objects.values_list('pk', 'room_id'))
    backfill(apps)
    assert list(AlertLog.objects.values_list('pk', 'room_id')) == before
