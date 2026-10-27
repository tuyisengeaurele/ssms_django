"""The simulator behaves like real devices: it goes through the same path, and it can stage a problem on demand."""
from unittest import mock

import pytest
from django.core.management import CommandError, call_command

from alerts.models import AlertLog
from sensors.models import IoTDevice, SensorReading
from tests.factories import BatchFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _no_email():
    with mock.patch('alerts.utils._send_mail_async'):
        yield


def run(*args):
    call_command('simulate_sensors', *args)


def test_a_normal_round_gives_every_active_batch_a_device_and_a_reading():
    first, second = BatchFactory(), BatchFactory()
    run()
    assert SensorReading.objects.filter(batch=first).count() == 1
    assert SensorReading.objects.filter(batch=second).count() == 1
    device = IoTDevice.objects.get(batch=first)
    assert device.status == 'online'
    assert device.last_seen is not None
    assert SensorReading.objects.get(batch=first).device_id == device.pk


def test_batches_that_are_deleted_get_nothing():
    BatchFactory(is_active=False)
    run()
    assert SensorReading.objects.count() == 0


def test_running_again_reuses_the_device():
    batch = BatchFactory()
    run()
    run()
    assert IoTDevice.objects.filter(batch=batch).count() == 1
    assert SensorReading.objects.filter(batch=batch).count() == 2


def test_the_rounds_option_repeats_the_round():
    batch = BatchFactory()
    run('--rounds', '3', '--interval', '0')
    assert SensorReading.objects.filter(batch=batch).count() == 3


def test_a_cold_scenario_opens_one_alert_however_many_rounds_run():
    batch = BatchFactory()
    run('--scenario', 'cold', '--rounds', '4', '--interval', '0')
    assert AlertLog.objects.filter(batch=batch, type='TEMPERATURE', resolved_at__isnull=True).count() == 1
    assert AlertLog.objects.filter(batch=batch, type='TEMPERATURE').count() == 1


def test_going_back_to_normal_resolves_the_alert():
    batch = BatchFactory()
    run('--scenario', 'cold')
    run('--scenario', 'normal')
    assert AlertLog.objects.get(batch=batch, type='TEMPERATURE').resolved_at is not None


@pytest.mark.parametrize('scenario, kind', [('cold', 'TEMPERATURE'), ('hot', 'TEMPERATURE'), ('humid', 'HUMIDITY'), ('dry', 'HUMIDITY')])
def test_each_scenario_stages_its_own_problem(scenario, kind):
    batch = BatchFactory()
    run('--scenario', scenario)
    assert list(AlertLog.objects.filter(batch=batch).values_list('type', flat=True)) == [kind]


def test_a_single_batch_can_be_chosen():
    chosen, other = BatchFactory(), BatchFactory()
    run('--batch', chosen.pk)
    assert SensorReading.objects.filter(batch=chosen).count() == 1
    assert SensorReading.objects.filter(batch=other).count() == 0


def test_normal_readings_stay_inside_the_safe_range_so_a_quiet_demo_stays_quiet():
    batch = BatchFactory()
    run('--rounds', '60', '--interval', '0')
    assert AlertLog.objects.filter(batch=batch).count() == 0


def test_an_unknown_scenario_is_refused():
    with pytest.raises(CommandError):
        run('--scenario', 'volcano')
