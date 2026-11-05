"""System health with a memory: results every few minutes, uptime from them, and the services that were missing."""
from datetime import timedelta
from types import SimpleNamespace
from unittest import mock

import httpx
import pytest
from django.core.management import call_command, load_command_class
from django.utils import timezone
from rest_framework.test import APIClient

from logs.jobs import LoggedCommand
from logs.models import HealthCheckResult, JobLog
from logs.uptime import uptime, uptime_from_counts
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

HISTORY = '/api/admin/health/history'
NOW = timezone.now()


def row(minutes_ago, status='ok'):
    return SimpleNamespace(checked_at=NOW - timedelta(minutes=minutes_ago), status=status)


# ── uptime, a pure function ─────────────────────────────────────────────────────────────────

def test_every_check_good_is_all_up():
    rows = [row(m) for m in range(0, 120, 5)]
    assert uptime(rows, timedelta(hours=24), NOW)['percent'] == 100.0


def test_every_check_bad_is_none_up():
    rows = [row(m, 'problem') for m in range(0, 60, 5)]
    assert uptime(rows, timedelta(hours=24), NOW)['percent'] == 0.0


def test_a_share_of_bad_checks_is_that_share_down():
    rows = [row(m) for m in range(0, 95, 5)] + [row(m, 'problem') for m in range(95, 100, 5)]
    # 19 good and 1 bad
    assert uptime(rows, timedelta(hours=24), NOW)['percent'] == 95.0


def test_no_rows_is_unknown_not_down():
    result = uptime([], timedelta(hours=24), NOW)
    assert result['percent'] is None and result['samples'] == 0


def test_a_gap_is_unknown_not_down():
    # Checks ran for an hour, then nothing for a day. The day without checks does not count against the service.
    rows = [row(m) for m in range(24 * 60, 24 * 60 + 60, 5)]
    assert uptime(rows, timedelta(days=7), NOW)['percent'] == 100.0


def test_rows_older_than_the_window_are_ignored():
    rows = [row(10, 'problem'), row(60 * 30)]
    assert uptime(rows, timedelta(hours=24), NOW) == {'percent': 0.0, 'samples': 1, 'coverage': pytest.approx(5 / (24 * 60), rel=1e-3)}


def test_a_service_that_is_not_set_up_is_not_counted_either_way():
    rows = [row(m, 'notSetUp') for m in range(0, 60, 5)]
    assert uptime(rows, timedelta(hours=24), NOW)['percent'] is None


def test_coverage_says_how_much_of_the_window_was_actually_checked():
    rows = [row(m) for m in range(0, 12 * 60, 5)]
    assert uptime(rows, timedelta(hours=24), NOW)['coverage'] == pytest.approx(0.5, rel=0.02)


def test_coverage_never_passes_one():
    rows = [row(m) for m in range(0, 60)]
    assert uptime(rows, timedelta(hours=1), NOW)['coverage'] <= 1.0


def test_the_percent_is_rounded_to_one_decimal():
    assert uptime_from_counts(ok=2, problem=1, window=timedelta(hours=24))['percent'] == 66.7


# ── the command and its rows ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def offline_services():
    """Nothing here may call the network."""
    answer = mock.Mock(status_code=200)
    answer.json.return_value = {'status': 'ok'}
    with mock.patch('core.health.httpx.get', return_value=answer), mock.patch('core.health.httpx.head', return_value=answer):
        yield


def test_the_command_writes_one_row_per_service():
    call_command('run_health_checks')
    services = list(HealthCheckResult.objects.values_list('service', flat=True))
    assert len(services) == len(set(services)) >= 9
    assert {'web', 'database', 'aiService', 'email', 'errorMonitoring', 'imageStorage', 'sensors', 'jobs', 'alertStream', 'website'} == set(services)


def test_a_row_keeps_the_status_the_time_taken_and_the_reason():
    with mock.patch('core.health.httpx.get', side_effect=httpx.TimeoutException('slow')):
        call_command('run_health_checks')
    ai = HealthCheckResult.objects.get(service='aiService')
    assert ai.status == 'problem' and ai.reason == 'timeout'
    database = HealthCheckResult.objects.get(service='database')
    assert database.status == 'ok' and database.milliseconds is not None and database.milliseconds >= 0


def test_the_command_is_logged_like_the_other_scheduled_ones():
    assert isinstance(load_command_class('logs', 'run_health_checks'), LoggedCommand)
    call_command('run_health_checks')
    assert JobLog.objects.filter(kind='command_finished', subject='run_health_checks').exists()


def test_one_service_failing_to_answer_does_not_stop_the_rest():
    with mock.patch('core.health.check_ai_service', side_effect=RuntimeError('boom')):
        call_command('run_health_checks')
    assert HealthCheckResult.objects.filter(service='database').exists()
    ai = HealthCheckResult.objects.get(service='aiService')
    assert ai.status == 'problem'


def test_the_prune_command_keeps_health_rows_30_days():
    keep = HealthCheckResult.objects.create(service='database', status='ok', checked_at=NOW - timedelta(days=29))
    drop = HealthCheckResult.objects.create(service='database', status='ok', checked_at=NOW - timedelta(days=31))
    call_command('prune_logs')
    assert set(HealthCheckResult.objects.values_list('pk', flat=True)) == {keep.pk} and drop


# ── the services that were missing ──────────────────────────────────────────────────────────

def checks():
    from core.health import run_checks
    return {c['key']: c for c in run_checks()['checks']}


def test_the_website_is_not_set_up_on_a_local_machine(settings):
    settings.FRONTEND_URL = 'http://localhost:5173'
    assert checks()['website']['status'] == 'notSetUp'


def test_the_website_answers_to_a_head_request(settings):
    settings.FRONTEND_URL = 'https://ssms.example.rw'
    with mock.patch('core.health.httpx.head', return_value=mock.Mock(status_code=200)) as head:
        found = checks()['website']
    assert found['status'] == 'ok' and 'ms' in found['values']
    assert head.call_args.args[0] == 'https://ssms.example.rw'


def test_a_website_that_does_not_answer_is_a_problem_and_its_address_is_not_reported(settings):
    settings.FRONTEND_URL = 'https://ssms.example.rw'
    with mock.patch('core.health.httpx.head', side_effect=httpx.ConnectError('refused')):
        found = checks()['website']
    assert found['status'] == 'problem' and 'ssms.example.rw' not in str(found)


def test_a_website_that_answers_with_an_error_is_a_problem(settings):
    settings.FRONTEND_URL = 'https://ssms.example.rw'
    with mock.patch('core.health.httpx.head', return_value=mock.Mock(status_code=502)):
        assert checks()['website']['status'] == 'problem'


def test_the_web_api_is_not_set_up_until_it_has_an_address_to_ask(settings):
    settings.HEALTH_API_URL = ''
    assert checks()['web']['status'] == 'notSetUp'


def test_the_web_api_is_asked_on_its_health_route(settings):
    settings.HEALTH_API_URL = 'https://api.example.rw'
    answer = mock.Mock(status_code=200)
    answer.json.return_value = {'status': 'ok'}
    with mock.patch('core.health.httpx.get', return_value=answer) as get:
        found = checks()['web']
    assert found['status'] == 'ok'
    assert get.call_args_list[-1].args[0] == 'https://api.example.rw/api/health' or any(c.args[0] == 'https://api.example.rw/api/health' for c in get.call_args_list)


def test_scheduled_jobs_are_not_set_up_before_any_has_run():
    assert checks()['jobs']['status'] == 'notSetUp'


def test_scheduled_jobs_are_fine_when_one_finished_lately():
    JobLog.objects.create(kind='command_finished', subject='prune_logs')
    assert checks()['jobs']['status'] == 'ok'


def test_scheduled_jobs_are_a_problem_when_the_last_finish_is_older_than_26_hours():
    row = JobLog.objects.create(kind='command_finished', subject='prune_logs')
    JobLog.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(hours=27))
    found = checks()['jobs']
    assert found['status'] == 'problem' and found['values']['hours'] >= 27


def test_scheduled_jobs_ignore_commands_that_run_by_hand():
    JobLog.objects.create(kind='command_finished', subject='seed_demo')
    assert checks()['jobs']['status'] == 'notSetUp'


def test_the_live_alert_stream_answers_with_a_first_line():
    UserFactory(role='ADMIN')
    found = checks()['alertStream']
    assert found['status'] == 'ok' and 'ms' in found['values']


def test_the_alert_stream_is_not_set_up_when_there_is_no_admin_to_open_it_for():
    assert checks()['alertStream']['status'] == 'notSetUp'


def test_the_alert_stream_is_a_problem_when_it_never_answers():
    UserFactory(role='ADMIN')
    with mock.patch('core.health.STREAM_WAIT_SECONDS', 0.05), mock.patch('core.health._first_line_of_the_stream', side_effect=TimeoutError):
        assert checks()['alertStream']['status'] == 'problem'


# ── the history API ─────────────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_client():
    client = APIClient()
    client.force_authenticate(user=UserFactory(role='ADMIN'))
    return client


def fill(service, count, step=5, status='ok', ms=20, start=0):
    for i in range(count):
        HealthCheckResult.objects.create(service=service, status=status, milliseconds=ms, checked_at=NOW - timedelta(minutes=start + i * step))


def test_the_history_has_a_series_and_the_uptime_per_service(admin_client):
    fill('database', 24, ms=12)
    body = admin_client.get(HISTORY).json()['data']['services']['database']
    assert len(body['points']) == 24
    assert {'at', 'status', 'ms'} <= set(body['points'][0])
    assert body['uptime']['day']['percent'] == 100.0
    assert set(body['uptime']) == {'day', 'week', 'month'}


def test_the_points_run_oldest_first_and_cover_the_last_24_hours(admin_client):
    fill('database', 10, step=5)
    fill('database', 3, step=60, start=26 * 60)
    points = admin_client.get(HISTORY).json()['data']['services']['database']['points']
    assert len(points) == 10
    assert [p['at'] for p in points] == sorted(p['at'] for p in points)


def test_a_service_with_no_rows_has_empty_unknown_uptime(admin_client):
    body = admin_client.get(HISTORY).json()['data']['services']
    assert 'database' in body
    assert body['database']['points'] == [] and body['database']['uptime']['day']['percent'] is None


def test_uptime_reaches_back_a_week_and_a_month(admin_client):
    fill('database', 12, step=60, status='ok', start=0)
    fill('database', 4, step=60, status='problem', start=3 * 24 * 60)
    fill('database', 4, step=60, status='problem', start=20 * 24 * 60)
    uptime_ = admin_client.get(HISTORY).json()['data']['services']['database']['uptime']
    assert uptime_['day']['percent'] == 100.0
    assert uptime_['week']['percent'] == 75.0
    assert uptime_['month']['percent'] == 60.0


def test_a_farmer_may_not_read_the_history():
    client = APIClient()
    client.force_authenticate(user=UserFactory(role='FARMER'))
    assert client.get(HISTORY).status_code == 403


def test_the_history_holds_no_address_and_no_secret(admin_client):
    fill('website', 3)
    text = admin_client.get(HISTORY).content.decode()
    assert 'http' not in text


def test_the_history_does_not_run_a_new_check(admin_client):
    with mock.patch('core.health.run_checks') as run:
        admin_client.get(HISTORY)
    run.assert_not_called()
