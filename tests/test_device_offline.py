"""A device that goes quiet is shown offline, and the batches in its room get one alert until it is heard from again."""
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from alerts.models import AlertLog
from batches.placement import place_batch
from farms.models import RearingRoom
from sensors.devices import mark_offline_devices
from sensors.models import IoTDevice
from tests.factories import BatchFactory, FarmFactory, IoTDeviceFactory, UserFactory

pytestmark = pytest.mark.django_db


def seen(minutes_ago):
    return timezone.now() - timedelta(minutes=minutes_ago)


def make_device(minutes_ago, batches=1, **kwargs):
    """An online device in a room that holds `batches` running batches."""
    farm = FarmFactory()
    room = RearingRoom.objects.create(farm=farm, name='Room A')
    held = []
    for _ in range(batches):
        batch = BatchFactory(farm=farm)
        place_batch(batch, room)
        held.append(batch)
    device = IoTDeviceFactory(farm=farm, room=room, status='online', last_seen=seen(minutes_ago) if minutes_ago is not None else None, **kwargs)
    device.held = held
    return device


def listed(auth_client, device):
    admin = auth_client(UserFactory(role='ADMIN'))
    rows = {row['id']: row for row in admin.get('/api/devices').json()['data']}
    return rows[device.pk]


def ingest(key):
    return APIClient().post('/api/devices/ingest', {'temperature': 25.0, 'humidity': 78.0}, format='json', HTTP_X_DEVICE_KEY=key)


def test_the_device_list_shows_a_quiet_device_as_offline_without_waiting_for_a_job(auth_client):
    assert listed(auth_client, make_device(5))['status'] == 'online'
    assert listed(auth_client, make_device(120))['status'] == 'offline'


def test_a_device_never_heard_from_is_offline(auth_client):
    assert listed(auth_client, make_device(None))['status'] == 'offline'


def test_a_device_in_error_stays_in_error(auth_client):
    device = make_device(5)
    IoTDevice.objects.filter(pk=device.pk).update(status='error')
    assert listed(auth_client, device)['status'] == 'error'


@override_settings(DEVICE_OFFLINE_MINUTES=10)
def test_the_quiet_time_comes_from_a_setting(auth_client):
    assert listed(auth_client, make_device(15))['status'] == 'offline'
    assert listed(auth_client, make_device(5))['status'] == 'online'


def test_the_job_marks_quiet_devices_offline_and_leaves_the_rest():
    quiet, fine = make_device(120), make_device(5)
    changed = mark_offline_devices()
    assert [d.pk for d in changed] == [quiet.pk]
    quiet.refresh_from_db()
    fine.refresh_from_db()
    assert (quiet.status, fine.status) == ('offline', 'online')


def test_the_job_opens_one_system_alert_on_the_batch_and_not_a_second_on_the_next_run():
    device = make_device(120, name='Shed 1')
    mark_offline_devices()
    mark_offline_devices()
    alert = AlertLog.objects.get(batch=device.held[0], type='SYSTEM')
    assert alert.message.startswith('Device Shed 1 has not sent data for 30 minutes')
    assert alert.resolved_at is None


def test_every_running_batch_in_the_room_is_told():
    device = make_device(120, batches=2, name='Shed 1')
    mark_offline_devices()
    assert [AlertLog.objects.filter(batch=b, type='SYSTEM').count() for b in device.held] == [1, 1]


def test_a_room_with_no_batch_goes_offline_without_an_alert():
    device = make_device(120, batches=0)
    mark_offline_devices()
    device.refresh_from_db()
    assert device.status == 'offline'
    assert AlertLog.objects.count() == 0


def test_a_device_without_a_room_goes_offline_without_an_alert():
    device = IoTDeviceFactory(room=None, status='online', last_seen=seen(120))
    mark_offline_devices()
    device.refresh_from_db()
    assert device.status == 'offline'
    assert AlertLog.objects.count() == 0


def test_switched_off_devices_are_ignored():
    device = make_device(120)
    IoTDevice.objects.filter(pk=device.pk).update(is_active=False)
    assert mark_offline_devices() == []


def test_hearing_from_the_device_again_brings_it_online_and_resolves_the_alert():
    device = make_device(120, batches=2, name='Shed 2', device_key='ssms-back-online-01')
    mark_offline_devices()
    assert ingest('ssms-back-online-01').status_code == 201
    device.refresh_from_db()
    assert device.status == 'online'
    for batch in device.held:
        assert AlertLog.objects.get(batch=batch, type='SYSTEM').resolved_at is not None


def test_a_second_outage_opens_a_new_alert():
    device = make_device(120, name='Shed 3', device_key='ssms-outage-two-001')
    mark_offline_devices()
    ingest('ssms-outage-two-001')
    IoTDevice.objects.filter(pk=device.pk).update(last_seen=seen(120))
    mark_offline_devices()
    assert AlertLog.objects.filter(batch=device.held[0], type='SYSTEM').count() == 2


def test_the_command_runs_the_job_and_says_what_it_did(capsys):
    make_device(120, name='Shed 4')
    call_command('mark_offline_devices')
    assert '1 device' in capsys.readouterr().out
