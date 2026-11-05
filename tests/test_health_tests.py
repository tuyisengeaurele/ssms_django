"""The test buttons on the Health tab: each one tries a real thing and says in plain words what happened."""
import io
from unittest import mock

import httpx
import pytest
from django.core import mail
from PIL import Image
from rest_framework.test import APIClient

from alerts.models import AlertLog
from audit_log.models import AuditLog
from core import health_tests
from farms.models import Farm, RearingRoom
from logs.models import HealthCheckResult
from sensors.models import IoTDevice, SensorReading
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

NAMES = ['email', 'storage', 'disease-check', 'database-write', 'device-ingest']


def url(name):
    return f'/api/admin/health/tests/{name}'


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN', email='boss@example.rw')


@pytest.fixture
def client(admin):
    c = APIClient()
    c.force_authenticate(user=admin)
    return c


def run(client, name):
    response = client.post(url(name), {}, format='json')
    assert response.status_code == 200, response.content[:300]
    return response.json()['data']


def counts():
    return {m.__name__: m.objects.count() for m in (Farm, RearingRoom, IoTDevice, SensorReading, AlertLog, HealthCheckResult)}


# ── who may press ───────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('name', NAMES)
def test_only_an_admin_may_run_a_test(name):
    for role in ('FARMER', 'SUPERVISOR'):
        c = APIClient()
        c.force_authenticate(user=UserFactory(role=role))
        assert c.post(url(name), {}, format='json').status_code == 403
    assert APIClient().post(url(name), {}, format='json').status_code == 401


def test_an_unknown_test_is_not_found(client):
    assert client.post(url('nothing'), {}, format='json').status_code == 404


def test_a_test_is_only_a_post(client):
    assert client.get(url('email')).status_code == 405


# ── what comes back ─────────────────────────────────────────────────────────────────────────

def test_the_answer_says_what_ran_whether_it_worked_how_and_how_long(client):
    answer = run(client, 'database-write')
    assert answer['name'] == 'database-write'
    assert answer['ok'] is True and answer['outcome'] == 'written'
    assert isinstance(answer['milliseconds'], int) and answer['ranAt']


# ── email ───────────────────────────────────────────────────────────────────────────────────

def test_the_email_test_goes_to_the_admin_who_pressed_and_to_nobody_else(client, admin):
    UserFactory(role='ADMIN', email='other-admin@example.rw')
    answer = run(client, 'email')
    assert answer['ok'] is True
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ['boss@example.rw']
    assert mail.outbox[0].cc == [] and mail.outbox[0].bcc == []


def test_an_email_that_goes_to_a_real_mail_server_says_sent(client, settings):
    settings.EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    with mock.patch('core.health_tests.send_email') as send:
        answer = run(client, 'email')
    send.assert_called_once()
    assert answer['outcome'] == 'sent'


def test_an_email_that_only_prints_says_so(client):
    assert run(client, 'email')['outcome'] == 'printed'


def test_an_email_that_cannot_be_sent_says_failed_and_does_not_crash(client):
    with mock.patch('core.health_tests.send_email', side_effect=OSError('connection refused')):
        answer = run(client, 'email')
    assert answer['ok'] is False and answer['outcome'] == 'failed'
    assert 'connection refused' not in str(answer)


# ── photo storage ───────────────────────────────────────────────────────────────────────────

def test_the_storage_test_uploads_one_pixel_and_deletes_it(client, settings):
    settings.CLOUDINARY_CLOUD_NAME = 'demo'
    settings.CLOUDINARY_UPLOAD_PRESET = 'preset'
    with mock.patch('core.health_tests.cloudinary.uploader.unsigned_upload', return_value={'delete_token': 'tok-1'}) as upload, \
            mock.patch('core.health_tests.httpx.post', return_value=mock.Mock(status_code=200)) as delete:
        answer = run(client, 'storage')
    assert answer['ok'] is True and answer['outcome'] == 'stored'
    sent = upload.call_args.args[0]
    assert Image.open(io.BytesIO(sent)).size == (1, 1)
    assert upload.call_args.kwargs.get('return_delete_token') is True
    delete.assert_called_once()
    assert delete.call_args.args[0] == 'https://api.cloudinary.com/v1_1/demo/delete_by_token'
    assert delete.call_args.kwargs['data'] == {'token': 'tok-1'}


def test_the_storage_test_says_so_when_storage_is_not_set_up(client, settings):
    settings.CLOUDINARY_CLOUD_NAME = ''
    with mock.patch('core.health_tests.cloudinary.uploader.unsigned_upload') as upload:
        answer = run(client, 'storage')
    assert answer['ok'] is False and answer['outcome'] == 'not_set_up'
    upload.assert_not_called()


def test_the_storage_test_says_when_the_upload_fails(client, settings):
    settings.CLOUDINARY_CLOUD_NAME = 'demo'
    with mock.patch('core.health_tests.cloudinary.uploader.unsigned_upload', side_effect=RuntimeError('401 bad preset')):
        answer = run(client, 'storage')
    assert answer['ok'] is False and answer['outcome'] == 'failed'
    assert 'preset' not in str(answer)


def test_the_storage_test_says_when_the_picture_could_not_be_taken_down(client, settings):
    settings.CLOUDINARY_CLOUD_NAME = 'demo'
    with mock.patch('core.health_tests.cloudinary.uploader.unsigned_upload', return_value={'delete_token': 't'}), \
            mock.patch('core.health_tests.httpx.post', side_effect=httpx.ConnectError('nope')):
        answer = run(client, 'storage')
    assert answer['ok'] is False and answer['outcome'] == 'stored_not_deleted'


# ── the disease check ───────────────────────────────────────────────────────────────────────

def test_the_disease_check_test_sends_a_picture_of_its_own(client, settings):
    settings.AI_SERVICE_URL = 'http://ai.example.invalid'
    settings.AI_SERVICE_SECRET = 'sample-secret'
    reply = mock.Mock(status_code=200)
    reply.json.return_value = {'result': 'NotSilkworm', 'confidence': 90.0}
    with mock.patch('core.health_tests.httpx.post', return_value=reply) as post:
        answer = run(client, 'disease-check')
    assert answer['ok'] is True and answer['outcome'] == 'answered'
    assert post.call_args.args[0] == 'http://ai.example.invalid/predict'
    name, content, kind = post.call_args.kwargs['files']['file']
    assert kind == 'image/png' and Image.open(io.BytesIO(content)).size[0] > 1
    assert post.call_args.kwargs['headers'] == {'X-Internal-Secret': 'sample-secret'}


@pytest.mark.parametrize('failure, outcome', [
    (httpx.TimeoutException('slow'), 'timeout'),
    (httpx.ConnectError('refused'), 'unreachable'),
])
def test_the_disease_check_test_says_why_it_did_not_get_an_answer(client, failure, outcome):
    with mock.patch('core.health_tests.httpx.post', side_effect=failure):
        answer = run(client, 'disease-check')
    assert answer['ok'] is False and answer['outcome'] == outcome


def test_the_disease_check_test_says_when_the_answer_is_not_one(client):
    with mock.patch('core.health_tests.httpx.post', return_value=mock.Mock(status_code=500)):
        assert run(client, 'disease-check')['outcome'] == 'bad_answer'
    odd = mock.Mock(status_code=200)
    odd.json.return_value = {'unexpected': True}
    with mock.patch('core.health_tests.httpx.post', return_value=odd):
        assert run(client, 'disease-check')['outcome'] == 'bad_answer'


def test_the_disease_check_test_never_shows_the_address_it_asked(client):
    with mock.patch('core.health_tests.httpx.post', side_effect=httpx.ConnectError('could not reach http://secret-host.internal')):
        assert 'secret-host' not in str(run(client, 'disease-check'))


# ── the database and the device intake leave nothing behind ─────────────────────────────────

def test_the_database_write_is_rolled_back(client):
    before = counts()
    assert run(client, 'database-write')['ok'] is True
    assert counts() == before


def test_a_database_that_cannot_be_written_says_so(client):
    with mock.patch('core.health_tests.HealthCheckResult.objects.create', side_effect=RuntimeError('read only')):
        answer = run(client, 'database-write')
    assert answer['ok'] is False and answer['outcome'] == 'failed'


def test_the_device_test_takes_a_reading_through_the_real_intake_and_leaves_nothing_behind(client):
    before = counts()
    answer = run(client, 'device-ingest')
    assert answer['ok'] is True and answer['outcome'] == 'accepted'
    assert counts() == before


def test_the_device_test_does_not_use_a_real_farm_or_raise_an_alert(client):
    farm = Farm.objects.create(owner=UserFactory(), name='Real farm')
    with mock.patch('core.health_tests.record_device_reading', wraps=health_tests.record_device_reading) as taken:
        run(client, 'device-ingest')
    device = taken.call_args.args[0]
    assert device.farm_id != farm.pk
    assert AlertLog.objects.count() == 0


def test_a_device_intake_that_breaks_says_so(client):
    with mock.patch('core.health_tests.record_device_reading', side_effect=RuntimeError('boom')):
        answer = run(client, 'device-ingest')
    assert answer['ok'] is False and answer['outcome'] == 'failed'


# ── written down, and not too often ─────────────────────────────────────────────────────────

def test_every_test_is_written_in_the_audit_log_with_how_it_went(client, admin):
    run(client, 'database-write')
    with mock.patch('core.health_tests.httpx.post', side_effect=httpx.ConnectError('x')):
        run(client, 'disease-check')
    entries = list(AuditLog.objects.filter(resource='HealthTest').order_by('id'))
    assert [(e.resource_id, e.outcome) for e in entries] == [('database-write', 'success'), ('disease-check', 'failure')]
    assert all(e.user_email == admin.email for e in entries)
    assert 'unreachable' in entries[1].detail


@pytest.mark.throttle
def test_a_sixth_test_in_a_minute_is_slowed_down(client):
    codes = [client.post(url('database-write'), {}, format='json').status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]


def test_the_limit_is_five_a_minute(settings):
    assert settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['health_test'] == '5/minute'
