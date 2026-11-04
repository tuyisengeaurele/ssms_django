"""The jobs and devices log: mail that failed, readings that were refused, devices that went quiet, commands that ran."""
from datetime import timedelta
from smtplib import SMTPException
from unittest import mock

import pytest
from django.core.management import call_command, load_command_class
from django.utils import timezone
from rest_framework.test import APIClient

from core.mail import Email, send_email
from logs.jobs import LoggedCommand, record_job
from logs.models import JobLog
from tests.factories import FarmFactory, IoTDeviceFactory, UserFactory

pytestmark = pytest.mark.django_db

INGEST = '/api/devices/ingest'


def kinds():
    return list(JobLog.objects.order_by('id').values_list('kind', flat=True))


def last():
    return JobLog.objects.order_by('-id').first()


# ── the writer ──────────────────────────────────────────────────────────────────────────────

def test_a_job_row_keeps_what_happened():
    record_job('device_offline', subject='DHT22 A', detail='No reading for 30 minutes')
    assert (last().kind, last().subject, last().detail) == ('device_offline', 'DHT22 A', 'No reading for 30 minutes')


def test_long_text_is_cut():
    record_job('email_failed', subject='s' * 900, detail='d' * 900)
    assert len(last().subject) <= 200 and len(last().detail) <= 300


def test_a_failing_write_never_breaks_the_job():
    with mock.patch('logs.jobs.JobLog.objects.create', side_effect=RuntimeError('database is down')):
        assert record_job('device_offline') is None


# ── mail ────────────────────────────────────────────────────────────────────────────────────

def a_message():
    return Email(heading='Hello', reason='Because', greeting='Hi', intro=('Text',))


def test_mail_that_could_not_be_sent_is_logged_and_still_raises_when_it_should():
    with mock.patch('core.mail.EmailMultiAlternatives.send', side_effect=SMTPException('connection refused')):
        with pytest.raises(SMTPException):
            send_email('Welcome to SSMS', ['someone@example.rw'], a_message())
    assert kinds() == ['email_failed']
    assert last().subject == 'Welcome to SSMS'
    assert 'SMTPException' in last().detail


def test_mail_that_fails_quietly_is_logged_so_it_is_not_lost():
    with mock.patch('core.mail.EmailMultiAlternatives.send', side_effect=SMTPException('connection refused')):
        send_email('Welcome to SSMS', ['someone@example.rw'], a_message(), fail_silently=True)
    assert kinds() == ['email_failed']


def test_the_address_the_mail_was_for_is_never_written_down():
    with mock.patch('core.mail.EmailMultiAlternatives.send', side_effect=SMTPException('550 someone@example.rw does not exist')):
        send_email('Welcome to SSMS', ['someone@example.rw'], a_message(), fail_silently=True)
    assert 'someone@example.rw' not in last().subject + last().detail


def test_mail_that_goes_out_leaves_nothing():
    send_email('Welcome to SSMS', ['someone@example.rw'], a_message())
    assert kinds() == []


# ── devices ─────────────────────────────────────────────────────────────────────────────────

def test_a_reading_with_a_wrong_key_is_logged_without_the_key():
    response = APIClient().post(INGEST, {'temperature': 24, 'humidity': 70}, format='json', HTTP_X_DEVICE_KEY='guessed-key-123456')
    assert response.status_code == 401
    assert kinds() == ['device_rejected']
    assert last().subject == '(unknown key)'
    assert 'guessed-key' not in last().subject + last().detail


def test_a_reading_that_does_not_make_sense_is_logged_with_the_device():
    device = IoTDeviceFactory(farm=FarmFactory())
    response = APIClient().post(INGEST, {'temperature': 'hot', 'humidity': 70}, format='json', HTTP_X_DEVICE_KEY=device.device_key)
    assert response.status_code == 422
    assert kinds() == ['device_rejected']
    assert last().subject == device.name


def test_a_good_reading_leaves_no_job_row():
    from farms.models import RearingRoom
    farm = FarmFactory()
    room = RearingRoom.objects.create(farm=farm, name='Room A')
    device = IoTDeviceFactory(farm=farm, room=room)
    response = APIClient().post(INGEST, {'temperature': 24, 'humidity': 70}, format='json', HTTP_X_DEVICE_KEY=device.device_key)
    assert response.status_code == 201, response.content
    assert kinds() == []


def test_a_device_that_went_quiet_is_logged():
    device = IoTDeviceFactory(farm=FarmFactory(), status='online')
    type(device).objects.filter(pk=device.pk).update(last_seen=timezone.now() - timedelta(hours=3))
    call_command('mark_offline_devices')
    assert 'device_offline' in kinds()
    assert JobLog.objects.filter(kind='device_offline', subject=device.name).exists()


# ── commands ────────────────────────────────────────────────────────────────────────────────

def test_a_command_that_ran_is_logged_at_both_ends():
    call_command('mark_offline_devices')
    assert kinds() == ['command_started', 'command_finished']
    assert {r.subject for r in JobLog.objects.all()} == {'mark_offline_devices'}


def test_a_command_that_failed_is_logged_and_still_fails():
    with mock.patch('sensors.management.commands.mark_offline_devices.mark_offline_devices', side_effect=RuntimeError('boom')):
        with pytest.raises(RuntimeError):
            call_command('mark_offline_devices')
    assert kinds() == ['command_started', 'command_failed']
    assert 'boom' in last().detail


@pytest.mark.parametrize('name, app', [
    ('mark_offline_devices', 'sensors'), ('cleanup_sensor_readings', 'sensors'), ('simulate_sensors', 'sensors'),
    ('prune_sessions', 'users'), ('prune_logs', 'logs'),
])
def test_every_scheduled_command_is_logged(name, app):
    assert isinstance(load_command_class(app, name), LoggedCommand)


def test_a_person_is_not_needed_for_any_of_this():
    UserFactory()
    assert JobLog.objects.count() == 0
