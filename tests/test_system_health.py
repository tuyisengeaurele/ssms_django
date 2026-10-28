"""The system health page: what an admin needs to know to tell whether SSMS is working, with no secrets in it."""
from datetime import timedelta
from unittest import mock

import httpx
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from alerts.models import AlertLog
from audit_log.models import AuditLog
from contacts.models import ContactMessage
from farms.models import RearingRoom
from sensors.models import IoTDevice, SensorReading
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    FarmFactory,
    IoTDeviceFactory,
    SensorReadingFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

URL = '/api/admin/health'


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN')


@pytest.fixture(autouse=True)
def ai_answers():
    """The disease check service answers, unless a test says otherwise. Nothing here may call the network."""
    answer = mock.Mock(status_code=200)
    answer.json.return_value = {'status': 'ok', 'classes': ['Healthy', 'Pebrine']}
    with mock.patch('core.health.httpx.get', return_value=answer) as patched:
        yield patched


def health(client):
    response = client.get(URL)
    assert response.status_code == 200, response.content[:300]
    return response.json()['data']


def check(report, key):
    return next(c for c in report['checks'] if c['key'] == key)


def an_online_device(farm=None, minutes_ago=1):
    device = IoTDeviceFactory(farm=farm or FarmFactory(), status='online', last_seen=timezone.now() - timedelta(minutes=minutes_ago))
    return device


def a_reading(minutes_ago=1):
    row = SensorReadingFactory(batch=BatchFactory())
    SensorReading.objects.filter(pk=row.pk).update(timestamp=timezone.now() - timedelta(minutes=minutes_ago))
    return row


# ── who may ask ─────────────────────────────────────────────────────────────

def test_an_admin_may_ask(auth_client, admin):
    assert auth_client(admin).get(URL).status_code == 200


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_nobody_else_may_ask(auth_client, role):
    assert auth_client(UserFactory(role=role)).get(URL).status_code == 403


def test_a_stranger_gets_nothing(api_client):
    assert api_client.get(URL).status_code == 401


def test_asking_changes_nothing_and_is_not_audited(auth_client, admin):
    health(auth_client(admin))
    assert not AuditLog.objects.exists()


# ── the shape of the answer ─────────────────────────────────────────────────

def test_the_report_says_when_it_was_made_and_lists_every_check(auth_client, admin):
    report = health(auth_client(admin))
    assert report['checkedAt']
    assert [c['key'] for c in report['checks']] == ['database', 'aiService', 'email', 'errorMonitoring', 'imageStorage', 'sensors']
    assert all(c['status'] in ('ok', 'problem', 'notSetUp') for c in report['checks'])


def test_the_overall_answer_is_ok_when_nothing_is_wrong(auth_client, admin):
    assert health(auth_client(admin))['overall'] == 'ok'


# ── the database ────────────────────────────────────────────────────────────

def test_the_database_answers_and_the_time_it_took_is_given(auth_client, admin):
    found = check(health(auth_client(admin)), 'database')
    assert found['status'] == 'ok' and isinstance(found['values']['ms'], int) and found['values']['ms'] >= 0


def test_a_database_that_does_not_answer_is_a_problem(auth_client, admin):
    client = auth_client(admin)
    with mock.patch('core.health._ping_database', side_effect=RuntimeError('down')):
        report = health(client)
    assert check(report, 'database')['status'] == 'problem'
    assert report['overall'] == 'problem'


# ── the disease check service ───────────────────────────────────────────────

def test_the_disease_check_service_answers(auth_client, admin, ai_answers):
    found = check(health(auth_client(admin)), 'aiService')
    assert found['status'] == 'ok' and isinstance(found['values']['ms'], int)
    assert ai_answers.call_args.kwargs['timeout'] == 3.0


@pytest.mark.parametrize('error, reason', [
    (httpx.ConnectError('refused'), 'unreachable'),
    (httpx.ConnectTimeout('slow'), 'timeout'),
    (httpx.ReadTimeout('slow'), 'timeout'),
])
def test_a_service_that_cannot_be_reached_or_is_too_slow_is_a_problem(auth_client, admin, ai_answers, error, reason):
    ai_answers.side_effect = error
    report = health(auth_client(admin))
    found = check(report, 'aiService')
    assert found['status'] == 'problem' and found['values']['reason'] == reason
    assert report['overall'] == 'problem'


def test_a_service_that_answers_with_an_error_is_a_problem(auth_client, admin, ai_answers):
    ai_answers.return_value = mock.Mock(status_code=500)
    found = check(health(auth_client(admin)), 'aiService')
    assert found['status'] == 'problem' and found['values']['reason'] == 'badAnswer'


def test_the_service_address_is_never_shown(auth_client, admin, settings):
    settings.AI_SERVICE_URL = 'http://10.1.2.3:8001'
    assert '10.1.2.3' not in auth_client(admin).get(URL).content.decode()


# ── email, error reporting, photo storage ───────────────────────────────────

def test_email_is_set_up_when_it_can_log_in(auth_client, admin, settings):
    settings.EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD = 'team@example.rw', 'hunter2-secret'
    assert check(health(auth_client(admin)), 'email')['status'] == 'ok'


@pytest.mark.parametrize('user, password', [('', ''), ('team@example.rw', ''), ('', 'hunter2-secret')])
def test_email_with_no_login_is_not_set_up(auth_client, admin, settings, user, password):
    settings.EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD = user, password
    found = check(health(auth_client(admin)), 'email')
    assert found['status'] == 'notSetUp' and found['values']['sends'] is False


def test_email_that_is_only_printed_is_not_set_up(auth_client, admin, settings):
    settings.EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
    settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD = 'team@example.rw', 'hunter2-secret'
    assert check(health(auth_client(admin)), 'email')['status'] == 'notSetUp'


def test_error_reporting_is_on_when_it_has_an_address(auth_client, admin, settings):
    settings.SENTRY_DSN = 'https://key@sentry.example/1'
    assert check(health(auth_client(admin)), 'errorMonitoring')['status'] == 'ok'
    settings.SENTRY_DSN = ''
    assert check(health(auth_client(admin)), 'errorMonitoring')['status'] == 'notSetUp'


def test_photo_storage_is_set_up_when_it_has_a_name_and_a_preset(auth_client, admin, settings):
    settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_UPLOAD_PRESET = 'cloud', 'preset'
    assert check(health(auth_client(admin)), 'imageStorage')['status'] == 'ok'
    settings.CLOUDINARY_UPLOAD_PRESET = ''
    assert check(health(auth_client(admin)), 'imageStorage')['status'] == 'notSetUp'


def test_not_set_up_is_not_a_problem(auth_client, admin, settings):
    settings.SENTRY_DSN = ''
    settings.EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
    assert health(auth_client(admin))['overall'] == 'ok'


def test_no_secret_is_ever_in_the_answer(auth_client, admin, settings):
    settings.EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD = 'team@example.rw', 'hunter2-secret'
    settings.AI_SERVICE_SECRET = 'ai-shared-secret'
    settings.SENTRY_DSN = 'https://publickey@sentry.example/1'
    settings.CLOUDINARY_UPLOAD_PRESET = 'secret-preset'
    body = auth_client(admin).get(URL).content.decode()
    for secret in ('hunter2-secret', 'team@example.rw', 'ai-shared-secret', 'publickey', 'sentry.example', 'secret-preset'):
        assert secret not in body


# ── sensors ─────────────────────────────────────────────────────────────────

def test_no_sensors_registered_is_not_set_up(auth_client, admin):
    found = check(health(auth_client(admin)), 'sensors')
    assert found['status'] == 'notSetUp'


def test_sensors_that_reported_lately_are_ok_with_their_counts(auth_client, admin):
    an_online_device(minutes_ago=1)
    IoTDeviceFactory(farm=FarmFactory(), status='offline', last_seen=timezone.now() - timedelta(days=2))
    IoTDeviceFactory(farm=FarmFactory(), status='offline', last_seen=None)
    a_reading(minutes_ago=2)
    found = check(health(auth_client(admin)), 'sensors')
    assert found['status'] == 'ok'
    assert (found['values']['online'], found['values']['offline'], found['values']['neverSeen']) == (1, 2, 1)
    assert found['values']['lastReadingAt']


def test_a_sensor_that_says_online_but_has_gone_quiet_counts_as_offline(auth_client, admin, settings):
    settings.DEVICE_OFFLINE_MINUTES = 30
    an_online_device(minutes_ago=120)
    a_reading(minutes_ago=1)
    found = check(health(auth_client(admin)), 'sensors')
    assert (found['values']['online'], found['values']['offline']) == (0, 1)


def test_nothing_reporting_for_a_while_is_a_problem(auth_client, admin, settings):
    settings.DEVICE_OFFLINE_MINUTES = 30
    an_online_device(minutes_ago=1)
    a_reading(minutes_ago=300)
    report = health(auth_client(admin))
    found = check(report, 'sensors')
    assert found['status'] == 'problem' and found['values']['silentMinutes'] >= 299
    assert report['overall'] == 'problem'


def test_sensors_with_no_reading_at_all_are_a_problem(auth_client, admin):
    an_online_device()
    found = check(health(auth_client(admin)), 'sensors')
    assert found['status'] == 'problem' and found['values']['lastReadingAt'] is None


def test_a_sensor_that_was_switched_off_on_purpose_is_not_counted(auth_client, admin):
    IoTDeviceFactory(farm=FarmFactory(), status='offline', is_active=False)
    assert check(health(auth_client(admin)), 'sensors')['status'] == 'notSetUp'


# ── what is waiting ─────────────────────────────────────────────────────────

def test_the_numbers_count_what_is_waiting(auth_client, admin):
    farm = FarmFactory()
    room = RearingRoom.objects.create(farm=farm, name='Rearing house 1')
    AlertLogFactory(batch=BatchFactory(farm=farm), type='DISEASE', message='x', is_read=False)
    AlertLogFactory(batch=BatchFactory(farm=farm), type='DISEASE', message='y', is_read=True)
    AlertLogFactory(batch=None, room=room, type='TEMPERATURE', message='hot')
    AlertLogFactory(batch=None, room=room, type='HUMIDITY', message='dry', resolved_at=timezone.now(), is_read=True)
    ContactMessage.objects.create(name='A', email='a@example.rw', subject='s', message='m')
    ContactMessage.objects.create(name='B', email='b@example.rw', subject='s', message='m', replied_at=timezone.now())
    numbers = health(auth_client(admin))['numbers']
    assert numbers == {'unreadAlerts': 2, 'openAirAlerts': 1, 'unansweredMessages': 1}


def test_an_empty_system_has_zeros(auth_client, admin):
    assert health(auth_client(admin))['numbers'] == {'unreadAlerts': 0, 'openAirAlerts': 0, 'unansweredMessages': 0}
    assert not AlertLog.objects.exists() and not IoTDevice.objects.exists()


# ── cost ────────────────────────────────────────────────────────────────────

def test_the_page_costs_a_fixed_number_of_queries(auth_client, admin):
    def cost(client):
        with CaptureQueriesContext(connection) as queries:
            assert client.get(URL).status_code == 200
        return len(queries)

    client = auth_client(admin)
    an_online_device()
    few = cost(client)
    for _ in range(8):
        an_online_device()
        AlertLogFactory(batch=BatchFactory(), type='DISEASE', message='x')
    assert cost(client) == few
