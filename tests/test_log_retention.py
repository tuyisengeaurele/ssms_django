"""How long each log is kept, and that the nightly job removes what is past it.

Request logs 30 days, security events 180 days, jobs and devices log 30 days, health check results 30 days. The audit log, who
changed what, is never removed.
"""
from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from audit_log.models import AuditLog
from core.health import NIGHTLY_COMMANDS
from logs.models import HealthCheckResult, JobLog, RequestLog, SecurityEvent

pytestmark = pytest.mark.django_db

NOW = timezone.now()


def make(model, days_old, **fields):
    """One row that is `days_old` days old. created_at is set on save, so it is moved afterwards."""
    if model is RequestLog:
        fields = {'request_id': 'r', 'method': 'GET', 'route': 'api/x', 'status': 500, **fields}
    if model is SecurityEvent:
        fields = {'kind': 'login_failed', **fields}
    if model is JobLog:
        fields = {'kind': 'mail_failed', **fields}
    if model is AuditLog:
        fields = {'action': 'UPDATE', 'resource': 'Farm', **fields}
    if model is HealthCheckResult:
        return model.objects.create(service='database', status='ok', checked_at=NOW - timedelta(days=days_old), **fields)
    row = model.objects.create(**fields)
    model.objects.filter(pk=row.pk).update(created_at=NOW - timedelta(days=days_old))
    return row


def prune():
    out = StringIO()
    call_command('prune_logs', stdout=out)
    return out.getvalue()


def left(model, *rows):
    return [row.pk for row in rows if model.objects.filter(pk=row.pk).exists()]


# ── the keeping times ───────────────────────────────────────────────────────────────────────

def test_the_keeping_times_are_thirty_days_a_hundred_and_eighty_and_thirty(settings):
    assert settings.REQUEST_LOG_KEEP_DAYS == 30
    assert settings.SECURITY_LOG_KEEP_DAYS == 180
    assert settings.JOB_LOG_KEEP_DAYS == 30
    assert settings.HEALTH_LOG_KEEP_DAYS == 30


@pytest.mark.parametrize('model, keep', [(RequestLog, 30), (SecurityEvent, 180), (JobLog, 30), (HealthCheckResult, 30)])
def test_a_row_inside_its_keeping_time_stays_and_one_past_it_goes(model, keep):
    inside, outside = make(model, keep - 1), make(model, keep + 1)
    prune()
    assert left(model, inside, outside) == [inside.pk]


def test_the_audit_log_is_never_removed():
    ancient = make(AuditLog, 365 * 10)
    recent = make(AuditLog, 1)
    prune()
    assert left(AuditLog, ancient, recent) == [ancient.pk, recent.pk]


def test_a_stream_is_judged_by_its_own_time_and_not_by_the_others(settings):
    """A 100 day old security event stays while a 100 day old request log goes."""
    event, request = make(SecurityEvent, 100), make(RequestLog, 100)
    prune()
    assert left(SecurityEvent, event) == [event.pk]
    assert left(RequestLog, request) == []


def test_the_times_follow_the_settings(settings):
    settings.REQUEST_LOG_KEEP_DAYS = 3
    young, old = make(RequestLog, 2), make(RequestLog, 4)
    prune()
    assert left(RequestLog, young, old) == [young.pk]


# ── the job ─────────────────────────────────────────────────────────────────────────────────

def test_it_says_how_many_rows_it_removed_from_each_log():
    make(RequestLog, 40)
    make(RequestLog, 41)
    make(SecurityEvent, 200)
    text = prune()
    assert 'RequestLog: deleted 2 rows older than 30 days.' in text
    assert 'SecurityEvent: deleted 1 rows older than 180 days.' in text
    assert 'JobLog: deleted 0 rows older than 30 days.' in text


def test_running_it_again_removes_nothing_more():
    make(RequestLog, 40)
    prune()
    assert 'RequestLog: deleted 0 rows' in prune()


def test_it_writes_that_it_ran_so_the_health_page_can_see_the_scheduler_is_alive():
    prune()
    subjects = set(JobLog.objects.filter(kind='command_finished').values_list('subject', flat=True))
    assert 'prune_logs' in subjects and 'prune_logs' in NIGHTLY_COMMANDS


def test_its_own_start_and_finish_rows_are_not_removed_by_the_run_that_wrote_them():
    prune()
    assert JobLog.objects.filter(subject='prune_logs', kind__in=['command_started', 'command_finished']).count() == 2


def test_the_nightly_workflow_runs_it():
    from pathlib import Path
    workflow = (Path(__file__).resolve().parent.parent / '.github' / 'workflows' / 'jobs-nightly.yml').read_text(encoding='utf-8')
    assert 'python manage.py prune_logs' in workflow
