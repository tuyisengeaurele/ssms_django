"""A burst of server errors or refusals is the sign of a problem or an attack, so admins get one mail about it."""
from datetime import timedelta

import pytest
from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.utils import timezone

from logs.models import JobLog, RequestLog, SecurityEvent
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def small_limits(settings):
    settings.LOG_BURST_MINUTES = 5
    settings.LOG_BURST_SERVER_ERRORS = 3
    settings.LOG_BURST_REFUSALS = 4
    cache.clear()


def errors(count, minutes_ago=1):
    for _ in range(count):
        row = RequestLog.objects.create(request_id='R' * 12, method='GET', route='api/x', status=500)
        RequestLog.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(minutes=minutes_ago))


def refusals(count, minutes_ago=1):
    for _ in range(count):
        row = SecurityEvent.objects.create(kind='permission_denied', detail='GET api/admin/logs/<str:stream>')
        SecurityEvent.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(minutes=minutes_ago))


def test_a_burst_of_server_errors_mails_the_admins():
    admins = [UserFactory(role='ADMIN'), UserFactory(role='ADMIN')]
    UserFactory(role='FARMER')
    errors(3)
    call_command('check_log_bursts')
    assert len(mail.outbox) == 1
    assert set(mail.outbox[0].to) == {a.email for a in admins}
    assert '3' in mail.outbox[0].subject or '3' in mail.outbox[0].body


def test_a_burst_of_refusals_mails_the_admins():
    UserFactory(role='ADMIN')
    refusals(4)
    call_command('check_log_bursts')
    assert len(mail.outbox) == 1


def test_a_few_errors_are_not_a_burst():
    UserFactory(role='ADMIN')
    errors(2)
    refusals(3)
    call_command('check_log_bursts')
    assert mail.outbox == []


def test_old_errors_do_not_count():
    UserFactory(role='ADMIN')
    errors(10, minutes_ago=30)
    call_command('check_log_bursts')
    assert mail.outbox == []


def test_one_burst_is_one_mail_not_one_every_five_minutes():
    UserFactory(role='ADMIN')
    errors(5)
    call_command('check_log_bursts')
    call_command('check_log_bursts')
    assert len(mail.outbox) == 1


def test_the_mail_says_where_to_look_and_carries_no_addresses_of_visitors():
    UserFactory(role='ADMIN')
    errors(3)
    RequestLog.objects.update(ip_address='203.0.113.9')
    call_command('check_log_bursts')
    body = mail.outbox[0].body
    assert 'Logs' in body
    assert '203.0.113.9' not in body


def test_no_admin_means_no_mail_and_no_crash():
    errors(5)
    call_command('check_log_bursts')
    assert mail.outbox == []


def test_a_burst_is_noted_in_the_jobs_log():
    UserFactory(role='ADMIN')
    errors(3)
    call_command('check_log_bursts')
    assert JobLog.objects.filter(kind='burst_alert').exists()


def test_the_command_is_logged_like_the_other_scheduled_ones():
    from django.core.management import load_command_class

    from logs.jobs import LoggedCommand
    assert isinstance(load_command_class('logs', 'check_log_bursts'), LoggedCommand)
