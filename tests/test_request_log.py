"""The request log: every failure and a sample of the good answers, with the route pattern and never what was in the request."""
from datetime import timedelta
from unittest import mock

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from logs.models import JobLog, RequestLog, SecurityEvent
from tests.factories import FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def everything(settings):
    settings.REQUEST_LOG_SAMPLE_RATE = 1.0


@pytest.fixture
def nothing_good(settings):
    settings.REQUEST_LOG_SAMPLE_RATE = 0.0


def rows():
    return list(RequestLog.objects.order_by('id'))


def test_the_sample_of_good_answers_is_five_percent_by_default():
    # The tests switch the sample off, so the default is read from the settings file itself.
    import ssms_django.settings as site
    assert site.REQUEST_LOG_SAMPLE_RATE == 0.05


@pytest.mark.parametrize('path, status', [('/api/nothing/here', 404), ('/api/auth/me', 401)])
def test_every_failed_request_is_logged(nothing_good, path, status):
    assert APIClient().get(path).status_code == status
    assert [r.status for r in rows()] == [status]


def test_a_refusal_for_a_role_is_logged(nothing_good):
    client = APIClient()
    client.force_authenticate(user=UserFactory(role='FARMER'))
    assert client.get('/api/admin/audit-log').status_code == 403
    assert [r.status for r in rows()] == [403]


def test_a_crash_is_logged(nothing_good):
    client = APIClient(raise_request_exception=False)
    client.force_authenticate(user=UserFactory())
    with mock.patch('users.views.ProfileView.get', side_effect=RuntimeError('boom')):
        assert client.get('/api/auth/me').status_code == 500
    assert [r.status for r in rows()] == [500]


def test_good_answers_are_only_a_sample(nothing_good):
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    client.get('/api/auth/me')
    assert rows() == []


def test_good_answers_are_logged_when_the_sample_is_everything(everything):
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    assert client.get('/api/auth/me').status_code == 200
    assert [r.status for r in rows()] == [200]


def test_the_health_probe_is_never_logged(everything):
    APIClient().get('/api/health')
    assert rows() == []


def test_a_browsers_preflight_question_is_not_logged_when_it_is_answered(everything):
    response = APIClient().options('/api/farms', HTTP_ORIGIN='http://localhost:5173', HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET')
    assert response.status_code == 200
    assert rows() == []


def test_a_row_has_the_reference_the_method_the_route_the_time_and_the_person(everything):
    user = UserFactory(role='SUPERVISOR')
    client = APIClient()
    client.force_authenticate(user=user)
    response = client.get('/api/auth/me', REMOTE_ADDR='203.0.113.9')
    row = rows()[0]
    assert row.request_id == response['X-Request-ID']
    assert (row.method, row.route, row.status) == ('GET', 'api/auth/me', 200)
    assert row.user_id == user.pk and row.role == 'SUPERVISOR'
    assert row.ip_address == '203.0.113.9'
    assert row.duration_ms >= 0


def test_a_stranger_has_no_person_on_the_row(nothing_good):
    APIClient().get('/api/auth/me')
    assert rows()[0].user_id is None and rows()[0].role == ''


def test_the_route_is_the_pattern_so_a_secret_in_the_address_never_lands_in_the_log(nothing_good):
    APIClient().get('/api/lots/very-secret-lot-token-abc123')
    row = rows()[0]
    assert row.route == 'api/lots/<str:token>'
    assert 'very-secret' not in ' '.join(str(v) for v in RequestLog.objects.values_list(*[f.name for f in RequestLog._meta.fields]).first())


def test_an_address_the_api_does_not_have_is_named_so_and_not_echoed(nothing_good):
    APIClient().get('/api/hunting-for-secrets/../etc/passwd')
    assert rows()[0].route == '(unmatched)'


def test_no_body_header_or_query_is_kept(everything):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION='Bearer header-secret-value-xyz')
    client.post('/api/auth/login?token=query-secret-abc', {'email': 'a@example.rw', 'password': 'body-secret-pw-123'}, format='json')
    stored = ' '.join(str(v) for row in RequestLog.objects.values_list(*[f.name for f in RequestLog._meta.fields]) for v in row)
    for secret in ('header-secret-value-xyz', 'query-secret-abc', 'body-secret-pw-123'):
        assert secret not in stored


def test_a_failing_log_never_breaks_the_request(everything):
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    with mock.patch('logs.middleware.RequestLog.objects.create', side_effect=RuntimeError('database is down')):
        assert client.get('/api/auth/me').status_code == 200


def test_the_user_of_a_token_is_known_by_the_time_the_row_is_written(everything):
    user = UserFactory(role='ADMIN')
    client = APIClient()
    response = client.post('/api/auth/login', {'email': user.email, 'password': 'Pass1234'}, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.json()["data"]["token"]}')
    RequestLog.objects.all().delete()
    client.get('/api/auth/me')
    assert rows()[0].user_id == user.pk


# ── keeping it short ────────────────────────────────────────────────────────────────────────

def old(model, days, **fields):
    row = model.objects.create(**fields)
    model.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=days))
    return row.pk


def test_the_prune_command_deletes_only_what_is_past_its_keeping_time():
    keep_request = old(RequestLog, 13, request_id='R' * 12, method='GET', route='api/x', status=404)
    drop_request = old(RequestLog, 15, request_id='R' * 12, method='GET', route='api/x', status=404)
    keep_event = old(SecurityEvent, 364, kind='login_ok')
    drop_event = old(SecurityEvent, 366, kind='login_ok')
    keep_job = old(JobLog, 89, kind='email_failed')
    drop_job = old(JobLog, 91, kind='email_failed')
    call_command('prune_logs')
    assert set(RequestLog.objects.values_list('pk', flat=True)) == {keep_request} and drop_request
    assert set(SecurityEvent.objects.values_list('pk', flat=True)) == {keep_event} and drop_event
    # The command writes its own start and end rows, which are new and stay.
    assert set(JobLog.objects.exclude(kind__startswith='command_').values_list('pk', flat=True)) == {keep_job} and drop_job


def test_the_audit_log_is_never_pruned():
    from audit_log.models import AuditLog
    row = AuditLog.objects.create(action='OTHER', resource='X')
    AuditLog.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=4000))
    call_command('prune_logs')
    assert AuditLog.objects.filter(pk=row.pk).exists()


def test_the_keeping_times_can_be_changed_in_settings(settings):
    settings.REQUEST_LOG_KEEP_DAYS = 1
    old(RequestLog, 2, request_id='R' * 12, method='GET', route='api/x', status=404)
    call_command('prune_logs')
    assert RequestLog.objects.count() == 0


def test_a_farm_request_logs_its_pattern_not_its_id(everything):
    owner = UserFactory(role='FARMER')
    farm = FarmFactory(owner=owner)
    client = APIClient()
    client.force_authenticate(user=owner)
    client.get(f'/api/farms/{farm.pk}')
    assert rows()[0].route == 'api/farms/<str:pk>'
