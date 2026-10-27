"""A room is judged once. A problem in a room is one alert however many batches are in it."""
from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from alerts.models import AlertLog, StageThreshold
from alerts.utils import check_room_alerts
from batches.models import BatchStage
from batches.placement import leave_room, place_batch
from farms.models import RearingRoom
from tests.factories import BatchFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _no_email():
    with mock.patch('alerts.utils._send_mail_async') as sent:
        yield sent


@pytest.fixture
def owner():
    return UserFactory(role='FARMER', name='Mugisha Serge', email='serge@example.rw')


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner, name='Serge Farm')


@pytest.fixture
def room(farm):
    return RearingRoom.objects.create(farm=farm, name='Rearing house 1')


def put(farm, room, stage='PUPA'):
    batch = BatchFactory(farm=farm, stage=stage)
    place_batch(batch, room)
    return batch


def alerts(room, type_=None):
    qs = AlertLog.objects.filter(room=room)
    return qs.filter(type=type_) if type_ else qs


def test_every_stage_starts_with_the_existing_safe_range():
    rows = {t.stage: t for t in StageThreshold.objects.all()}
    assert set(rows) == {stage.value for stage in BatchStage}
    for row in rows.values():
        assert (row.temp_min, row.temp_max, row.hum_min, row.hum_max) == (22.0, 28.0, 70.0, 85.0)


# ── one alert per room and problem ──────────────────────────────────────────

def test_a_reading_in_range_makes_no_alert(farm, room):
    put(farm, room)
    assert check_room_alerts(room.pk, 25.0, 78.0) == []
    assert AlertLog.objects.count() == 0


def test_a_cold_reading_opens_one_temperature_alert_that_belongs_to_the_room(farm, room):
    put(farm, room)
    created = check_room_alerts(room.pk, 20.5, 78.0)
    assert [a.type for a in created] == ['TEMPERATURE']
    alert = alerts(room).get()
    assert (alert.room_id, alert.batch_id, alert.resolved_at) == (room.pk, None, None)
    assert 'Temperature too low: 20.5' in alert.message


def test_three_batches_in_a_room_get_one_alert_between_them(farm, room):
    for _ in range(3):
        put(farm, room)
    check_room_alerts(room.pk, 20.5, 90.0)
    assert alerts(room, 'TEMPERATURE').count() == 1
    assert alerts(room, 'HUMIDITY').count() == 1


def test_the_same_problem_again_does_not_open_a_second_alert(farm, room):
    put(farm, room)
    check_room_alerts(room.pk, 20.5, 78.0)
    assert check_room_alerts(room.pk, 20.1, 78.0) == []
    assert alerts(room, 'TEMPERATURE').count() == 1


def test_a_good_reading_resolves_the_open_alert(farm, room):
    put(farm, room)
    check_room_alerts(room.pk, 20.5, 78.0)
    check_room_alerts(room.pk, 24.0, 78.0)
    assert alerts(room).get().resolved_at is not None


def test_a_new_problem_after_a_resolved_one_opens_a_new_alert(farm, room):
    put(farm, room)
    check_room_alerts(room.pk, 20.5, 78.0)
    check_room_alerts(room.pk, 24.0, 78.0)
    check_room_alerts(room.pk, 29.5, 78.0)
    assert alerts(room, 'TEMPERATURE').count() == 2
    assert alerts(room, 'TEMPERATURE').filter(resolved_at__isnull=True).count() == 1


def test_temperature_and_humidity_are_tracked_separately(farm, room):
    put(farm, room)
    check_room_alerts(room.pk, 20.5, 78.0)
    created = check_room_alerts(room.pk, 20.5, 90.0)
    assert [a.type for a in created] == ['HUMIDITY']
    check_room_alerts(room.pk, 24.0, 90.0)
    assert alerts(room, 'TEMPERATURE').get().resolved_at is not None
    assert alerts(room, 'HUMIDITY').get().resolved_at is None


def test_rooms_do_not_resolve_each_others_alerts(farm, room):
    other = RearingRoom.objects.create(farm=farm, name='Rearing house 2')
    put(farm, room)
    put(farm, other)
    check_room_alerts(room.pk, 20.5, 78.0)
    check_room_alerts(other.pk, 24.0, 78.0)
    assert alerts(room).get().resolved_at is None


def test_alerts_are_never_bulk_inserted_because_the_real_alert_table_has_a_native_enum_column(farm, room):
    """Older databases made alert_logs.type a Postgres enum. Django's bulk insert cannot write into one."""
    put(farm, room)
    with mock.patch.object(AlertLog.objects, 'bulk_create', side_effect=AssertionError('bulk insert of alerts')):
        assert [a.type for a in check_room_alerts(room.pk, 20.5, 90.0)] == ['TEMPERATURE', 'HUMIDITY']


def test_an_open_alert_that_was_kept_per_batch_before_rooms_is_resolved_and_blocks_a_copy(farm, room):
    batch = put(farm, room)
    old = AlertLog.objects.create(batch=batch, room=room, type='TEMPERATURE', message='Temperature too low: 20.0')
    assert check_room_alerts(room.pk, 20.5, 78.0) == []
    check_room_alerts(room.pk, 24.0, 78.0)
    old.refresh_from_db()
    assert old.resolved_at is not None


# ── the range of a room ─────────────────────────────────────────────────────

def test_a_room_with_a_running_batch_uses_the_range_of_its_stage(farm, room):
    StageThreshold.objects.filter(stage='LARVA').update(temp_min=26.0, temp_max=29.0)
    put(farm, room, 'LARVA')
    assert [a.type for a in check_room_alerts(room.pk, 25.0, 78.0)] == ['TEMPERATURE']


def test_batches_with_different_ranges_share_the_range_they_agree_on(farm, room):
    StageThreshold.objects.filter(stage='LARVA').update(temp_min=24.0, temp_max=27.0)
    put(farm, room, 'LARVA')
    put(farm, room, 'PUPA')
    # 23 is fine for the pupa (22 to 28) but too cold for the larva (24 to 27).
    created = check_room_alerts(room.pk, 23.0, 78.0)
    assert [a.type for a in created] == ['TEMPERATURE']
    assert 'safe min is 24.0' in created[0].message


def test_batches_that_agree_on_nothing_use_the_youngest_stage(farm, room):
    StageThreshold.objects.filter(stage='EGG').update(temp_min=22.0, temp_max=24.0)
    StageThreshold.objects.filter(stage='PUPA').update(temp_min=26.0, temp_max=28.0)
    put(farm, room, 'PUPA')
    put(farm, room, 'EGG')
    created = check_room_alerts(room.pk, 25.0, 78.0)
    assert [a.type for a in created] == ['TEMPERATURE']
    assert 'Temperature too high: 25.0' in created[0].message
    assert 'safe max is 24.0' in created[0].message


def test_a_batch_at_harvest_does_not_change_the_range(farm, room):
    StageThreshold.objects.filter(stage='HARVEST').update(temp_min=26.0, temp_max=29.0)
    put(farm, room, 'PUPA')
    put(farm, room, 'HARVEST')
    assert check_room_alerts(room.pk, 25.0, 78.0) == []


def test_a_deleted_batch_does_not_count(farm, room):
    StageThreshold.objects.filter(stage='LARVA').update(temp_min=26.0, temp_max=29.0)
    put(farm, room, 'PUPA')
    gone = put(farm, room, 'LARVA')
    gone.is_active = False
    gone.save(update_fields=['is_active'])
    assert check_room_alerts(room.pk, 25.0, 78.0) == []


def test_a_missing_threshold_row_falls_back_to_the_default_range(farm, room):
    StageThreshold.objects.filter(stage='COCOON').delete()
    put(farm, room, 'COCOON')
    assert [a.type for a in check_room_alerts(room.pk, 20.0, 78.0)] == ['TEMPERATURE']


def test_the_message_names_the_range_that_was_used(farm, room):
    StageThreshold.objects.filter(stage='PUPA').update(hum_min=60.0, hum_max=75.0)
    put(farm, room, 'PUPA')
    check_room_alerts(room.pk, 25.0, 80.0)
    assert 'safe max is 75.0%' in alerts(room).get().message


# ── a room that is not judged ───────────────────────────────────────────────

def test_a_room_with_no_batch_is_not_judged(room):
    assert check_room_alerts(room.pk, 10.0, 10.0) == []
    assert AlertLog.objects.count() == 0


def test_a_room_with_only_a_batch_at_harvest_is_not_judged(farm, room):
    put(farm, room, 'HARVEST')
    assert check_room_alerts(room.pk, 10.0, 10.0) == []


def test_a_deleted_room_is_not_judged(farm, room):
    put(farm, room)
    RearingRoom.objects.filter(pk=room.pk).update(is_active=False)
    assert check_room_alerts(room.pk, 10.0, 10.0) == []


def test_an_unknown_room_is_not_judged():
    assert check_room_alerts('missing', 10.0, 10.0) == []


# ── when the room empties, the alert is resolved ────────────────────────────

def open_alert(room, farm):
    put(farm, room)
    check_room_alerts(room.pk, 20.5, 78.0)
    return alerts(room).get()


def test_moving_the_last_batch_out_resolves_the_alert(farm, room):
    other = RearingRoom.objects.create(farm=farm, name='Rearing house 2')
    alert = open_alert(room, farm)
    place_batch(room.batches.get(), other)
    alert.refresh_from_db()
    assert alert.resolved_at is not None


def test_moving_one_of_two_batches_out_keeps_the_alert_open(farm, room):
    other = RearingRoom.objects.create(farm=farm, name='Rearing house 2')
    alert = open_alert(room, farm)
    second = put(farm, room)
    place_batch(second, other)
    alert.refresh_from_db()
    assert alert.resolved_at is None


def test_removing_the_last_batch_resolves_the_alert(auth_client, owner, farm, room):
    alert = open_alert(room, farm)
    batch = room.batches.get()
    assert auth_client(owner).delete(f'/api/batches/{batch.pk}').status_code == 200
    alert.refresh_from_db()
    assert alert.resolved_at is not None


def test_a_batch_reaching_harvest_resolves_the_alert_when_it_was_the_last_running_one(auth_client, owner, farm, room):
    alert = open_alert(room, farm)
    batch = room.batches.get()
    assert auth_client(owner).patch(f'/api/batches/{batch.pk}/stage', {'stage': 'HARVEST'}, format='json').status_code == 200
    alert.refresh_from_db()
    assert alert.resolved_at is not None


def test_a_batch_leaving_resolves_the_system_alert_as_well(farm, room):
    batch = put(farm, room)
    AlertLog.objects.create(room=room, type='SYSTEM', message='Device Shed 1 has not sent data for 30 minutes.')
    leave_room(batch)
    from alerts.utils import settle_room_alerts
    settle_room_alerts(room.pk)
    assert alerts(room, 'SYSTEM').get().resolved_at is not None


# ── the email ───────────────────────────────────────────────────────────────

def test_one_email_goes_out_per_problem_not_per_reading(farm, room, _no_email):
    put(farm, room)
    for t in (20.5, 20.1, 19.9):
        check_room_alerts(room.pk, t, 78.0)
    assert _no_email.call_count == 1


def test_the_email_goes_to_the_farm_owner_and_names_the_room_its_batches_and_the_range_used(farm, room, _no_email):
    first, second = put(farm, room), put(farm, room)
    StageThreshold.objects.filter(stage='PUPA').update(temp_min=23.0, temp_max=27.0)
    check_room_alerts(room.pk, 20.5, 78.0)
    _, to, content = _no_email.call_args.args
    assert to == ['serge@example.rw']
    body = content.plain()
    assert 'Rearing house 1' in body
    assert f'#{first.pk[-8:].upper()}' in body and f'#{second.pk[-8:].upper()}' in body
    assert '23.0' in body and '27.0' in body


def test_a_later_problem_in_another_room_is_not_held_back_by_the_throttle(farm, room, _no_email):
    other = RearingRoom.objects.create(farm=farm, name='Rearing house 2')
    put(farm, room)
    put(farm, other)
    check_room_alerts(room.pk, 20.5, 78.0)
    check_room_alerts(other.pk, 20.5, 78.0)
    assert _no_email.call_count == 2


def test_the_throttle_lets_a_problem_that_comes_back_after_an_hour_send_again(farm, room, _no_email):
    put(farm, room)
    check_room_alerts(room.pk, 20.5, 78.0)
    check_room_alerts(room.pk, 24.0, 78.0)
    AlertLog.objects.filter(room=room).update(created_at=timezone.now() - timedelta(minutes=61))
    check_room_alerts(room.pk, 20.5, 78.0)
    assert _no_email.call_count == 2
