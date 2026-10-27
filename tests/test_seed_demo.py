"""seed_demo fills a database with a believable month of data for a demo, and only ever touches its own rows."""
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from alerts.models import AlertLog
from batches.models import Batch
from cooperatives.models import Cooperative
from farms.models import Farm
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection, IoTDevice, SensorReading
from tests.factories import FarmFactory, UserFactory
from users.models import User

pytestmark = pytest.mark.django_db

PASSWORD = 'Silk-Demo-2026'


def seed(*args, **kwargs):
    call_command('seed_demo', '--days', '3', '--seed', '7', '--password', PASSWORD, *args, **kwargs)


def demo_users():
    return User.objects.filter(email__endswith='@demo.ssms.rw')


def test_it_builds_a_cooperative_with_a_supervisor_and_three_farmers():
    seed()
    assert Cooperative.objects.filter(name='Demo Silk Cooperative').count() == 1
    assert demo_users().filter(role='SUPERVISOR').count() == 1
    assert demo_users().filter(role='FARMER').count() == 3
    coop = Cooperative.objects.get(name='Demo Silk Cooperative')
    assert all(u.cooperative_id == coop.pk for u in demo_users())
    assert all(u.is_email_verified and u.is_active for u in demo_users())


def test_each_farmer_has_a_farm_a_running_batch_a_finished_batch_and_a_device_per_batch():
    seed()
    assert Farm.objects.filter(owner__in=demo_users()).count() == 3
    batches = Batch.objects.filter(farm__owner__in=demo_users())
    assert batches.count() == 6
    assert sorted(batches.values_list('stage', flat=True)).count('HARVEST') == 3
    assert IoTDevice.objects.filter(farm__owner__in=demo_users()).count() == 6
    assert HarvestRecord.objects.filter(batch__in=batches).count() == 3


def test_the_running_batches_are_in_different_stages_that_follow_from_their_age():
    seed()
    running = Batch.objects.filter(farm__owner__in=demo_users()).exclude(stage='HARVEST')
    assert sorted(running.values_list('stage', flat=True)) == ['COCOON', 'LARVA', 'PUPA']


def test_readings_are_hourly_for_the_asked_days_and_end_now():
    seed()
    running = Batch.objects.filter(farm__owner__in=demo_users()).exclude(stage='HARVEST').first()
    readings = SensorReading.objects.filter(batch=running).order_by('timestamp')
    assert 70 <= readings.count() <= 74
    assert timezone.now() - readings.last().timestamp < timedelta(hours=2)
    assert timezone.now() - readings.first().timestamp > timedelta(days=2, hours=20)
    assert all(-40 <= r.temperature <= 85 and 0 <= r.humidity <= 100 for r in readings)


def test_a_finished_batch_has_no_readings_after_its_harvest():
    seed()
    harvested = Batch.objects.filter(farm__owner__in=demo_users(), stage='HARVEST').first()
    record = HarvestRecord.objects.get(batch=harvested)
    assert not SensorReading.objects.filter(batch=harvested, timestamp__gt=record.harvested_at).exists()


def test_the_story_has_a_resolved_cold_night_and_a_humid_spell_still_open():
    call_command('seed_demo', '--days', '10', '--seed', '7', '--password', PASSWORD)
    env_alerts = AlertLog.objects.filter(batch__farm__owner__in=demo_users(), type__in=['TEMPERATURE', 'HUMIDITY'])
    assert env_alerts.filter(resolved_at__isnull=False).exists()
    assert env_alerts.filter(resolved_at__isnull=True).exists()


def test_alerts_follow_the_same_rules_as_the_live_system():
    call_command('seed_demo', '--days', '10', '--seed', '7', '--password', PASSWORD)
    for batch in Batch.objects.filter(farm__owner__in=demo_users()):
        for kind in ('TEMPERATURE', 'HUMIDITY'):
            alerts = AlertLog.objects.filter(batch=batch, type=kind)
            assert alerts.filter(resolved_at__isnull=True).count() <= 1
            for alert in alerts.filter(resolved_at__isnull=False):
                assert alert.resolved_at >= alert.created_at


def test_one_disease_check_is_positive_and_has_an_unread_alert():
    seed()
    results = list(DiseaseDetection.objects.filter(batch__farm__owner__in=demo_users()).values_list('result', flat=True))
    assert results.count('Healthy') >= 5
    assert results.count('Flacherie') == 1
    assert AlertLog.objects.filter(batch__farm__owner__in=demo_users(), type='DISEASE', is_read=False).count() == 1


def test_stage_changes_are_in_the_alert_history():
    seed()
    assert AlertLog.objects.filter(batch__farm__owner__in=demo_users(), type='STAGE_CHANGE').exists()


def test_the_supervisor_and_a_farmer_can_sign_in_with_the_given_password():
    seed()
    for email in ('supervisor@demo.ssms.rw', 'farmer1@demo.ssms.rw'):
        response = APIClient().post('/api/auth/login', {'email': email, 'password': PASSWORD}, format='json')
        assert response.status_code == 200, email


def test_without_a_password_it_makes_a_strong_one_and_says_it_once(capsys):
    call_command('seed_demo', '--days', '2', '--seed', '7')
    out = capsys.readouterr().out
    line = next(line for line in out.splitlines() if line.startswith('Password:'))
    password = line.split(':', 1)[1].strip()
    response = APIClient().post('/api/auth/login', {'email': 'supervisor@demo.ssms.rw', 'password': password}, format='json')
    assert response.status_code == 200


def test_running_it_twice_does_not_duplicate_anything():
    seed()
    counts = (demo_users().count(), Batch.objects.count(), SensorReading.objects.count(), AlertLog.objects.count())
    seed()
    assert (demo_users().count(), Batch.objects.count(), SensorReading.objects.count(), AlertLog.objects.count()) == counts


def test_reset_replaces_the_demo_data_and_leaves_everything_else_alone():
    real_user = UserFactory(email='real.farmer@example.rw')
    real_farm = FarmFactory(owner=real_user, name='A real farm')
    seed()
    first = SensorReading.objects.filter(batch__farm__owner__in=demo_users()).count()
    seed('--reset')
    assert SensorReading.objects.filter(batch__farm__owner__in=demo_users()).count() == first
    assert User.objects.filter(pk=real_user.pk).exists()
    assert Farm.objects.filter(pk=real_farm.pk).exists()


def test_the_same_seed_gives_the_same_numbers():
    def first_temperatures():
        rows = SensorReading.objects.filter(device__device_key='ssms-demo-1a').order_by('timestamp')
        return list(rows.values_list('temperature', flat=True)[:30])

    fixed = ('--now', '2026-10-27T12:00:00+00:00')
    seed(*fixed)
    first = first_temperatures()
    seed('--reset', *fixed)
    assert first and first == first_temperatures()


def test_the_devices_of_running_batches_are_online_and_the_finished_ones_are_not():
    seed()
    running = IoTDevice.objects.filter(batch__farm__owner__in=demo_users()).exclude(batch__stage='HARVEST')
    assert all(d.status == 'online' for d in running)
    done = IoTDevice.objects.filter(batch__farm__owner__in=demo_users(), batch__stage='HARVEST')
    assert all(d.status == 'offline' for d in done)
