"""The simulator behaves like real devices: one per room, through the same path, and it can stage a problem on demand."""
from unittest import mock

import pytest
from django.core.management import CommandError, call_command

from alerts.models import AlertLog
from batches.placement import place_batch
from farms.models import RearingRoom
from sensors.models import IoTDevice, SensorReading
from tests.factories import BatchFactory, FarmFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _no_email():
    with mock.patch('alerts.utils._send_mail_async'):
        yield


def run(*args):
    call_command('simulate_sensors', *args)


def in_new_room(farm=None, **kw):
    """A running batch in a room of its own."""
    farm = farm or FarmFactory()
    room = RearingRoom.objects.create(farm=farm, name=f'Room {RearingRoom.objects.count()}')
    batch = BatchFactory(farm=farm, **kw)
    place_batch(batch, room)
    return batch, room


def test_a_normal_round_gives_every_room_with_a_running_batch_a_device_and_a_reading():
    (_, first), (_, second) = in_new_room(), in_new_room()
    run()
    assert SensorReading.objects.filter(room=first).count() == 1
    assert SensorReading.objects.filter(room=second).count() == 1
    device = IoTDevice.objects.get(room=first)
    assert (device.status, device.farm_id) == ('online', first.farm_id)
    assert device.last_seen is not None
    assert SensorReading.objects.get(room=first).device_id == device.pk


def test_batches_sharing_a_room_share_one_device_and_one_reading():
    batch, room = in_new_room()
    other = BatchFactory(farm=batch.farm)
    place_batch(other, room)
    run()
    assert IoTDevice.objects.filter(room=room).count() == 1
    assert SensorReading.objects.filter(room=room).count() == 1


def test_a_room_without_a_running_batch_gets_nothing():
    farm = FarmFactory()
    RearingRoom.objects.create(farm=farm, name='Empty')
    in_new_room(farm=farm, is_active=False)
    run()
    assert SensorReading.objects.count() == 0


def test_a_batch_that_was_never_placed_gets_nothing():
    BatchFactory()
    run()
    assert SensorReading.objects.count() == 0


def test_running_again_reuses_the_device():
    _, room = in_new_room()
    run()
    run()
    assert IoTDevice.objects.filter(room=room).count() == 1
    assert SensorReading.objects.filter(room=room).count() == 2


def test_the_rounds_option_repeats_the_round():
    _, room = in_new_room()
    run('--rounds', '3', '--interval', '0')
    assert SensorReading.objects.filter(room=room).count() == 3


def test_a_cold_scenario_opens_one_alert_per_batch_however_many_rounds_run():
    batch, room = in_new_room()
    run('--scenario', 'cold', '--rounds', '4', '--interval', '0')
    assert AlertLog.objects.filter(batch=batch, type='TEMPERATURE').count() == 1


def test_going_back_to_normal_resolves_the_alert():
    batch, _ = in_new_room()
    run('--scenario', 'cold')
    run('--scenario', 'normal')
    assert AlertLog.objects.get(batch=batch, type='TEMPERATURE').resolved_at is not None


@pytest.mark.parametrize('scenario, kind', [('cold', 'TEMPERATURE'), ('hot', 'TEMPERATURE'), ('humid', 'HUMIDITY'), ('dry', 'HUMIDITY')])
def test_each_scenario_stages_its_own_problem(scenario, kind):
    batch, _ = in_new_room()
    run('--scenario', scenario)
    assert list(AlertLog.objects.filter(batch=batch).values_list('type', flat=True)) == [kind]


def test_a_single_room_or_the_room_of_a_batch_can_be_chosen():
    (batch, chosen), (_, other) = in_new_room(), in_new_room()
    run('--room', chosen.pk)
    run('--batch', batch.pk)
    assert SensorReading.objects.filter(room=chosen).count() == 2
    assert SensorReading.objects.filter(room=other).count() == 0


def test_normal_readings_stay_inside_the_safe_range_so_a_quiet_demo_stays_quiet():
    batch, _ = in_new_room()
    run('--rounds', '60', '--interval', '0')
    assert AlertLog.objects.filter(batch=batch).count() == 0


def test_an_unknown_scenario_is_refused():
    with pytest.raises(CommandError):
        run('--scenario', 'volcano')
