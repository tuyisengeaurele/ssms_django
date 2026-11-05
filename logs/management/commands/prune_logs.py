"""
Management command: prune_logs
Deletes log rows that are past their keeping time. The audit log, who changed what, is never pruned.

    python manage.py prune_logs

Run it every night. The keeping times are REQUEST_LOG_KEEP_DAYS (14), SECURITY_LOG_KEEP_DAYS (365) and JOB_LOG_KEEP_DAYS (90) and HEALTH_LOG_KEEP_DAYS (30).
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from logs.jobs import LoggedCommand
from logs.models import HealthCheckResult, JobLog, RequestLog, SecurityEvent


class Command(LoggedCommand):
    help = 'Delete log rows that are past their keeping time.'

    def handle(self, *args, **options):
        now = timezone.now()
        for model, field, days in (
            (RequestLog, 'created_at', settings.REQUEST_LOG_KEEP_DAYS),
            (SecurityEvent, 'created_at', settings.SECURITY_LOG_KEEP_DAYS),
            (JobLog, 'created_at', settings.JOB_LOG_KEEP_DAYS),
            (HealthCheckResult, 'checked_at', settings.HEALTH_LOG_KEEP_DAYS),
        ):
            deleted, _ = model.objects.filter(**{f'{field}__lt': now - timedelta(days=days)}).delete()
            self.stdout.write(f'{model.__name__}: deleted {deleted} rows older than {days} days.')
