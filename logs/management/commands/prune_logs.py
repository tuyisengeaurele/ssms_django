"""
Management command: prune_logs
Deletes log rows that are past their keeping time. The audit log, who changed what, is never pruned.

    python manage.py prune_logs

Run it every night. The keeping times are REQUEST_LOG_KEEP_DAYS (14), SECURITY_LOG_KEEP_DAYS (365) and JOB_LOG_KEEP_DAYS (90).
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from logs.jobs import LoggedCommand
from logs.models import JobLog, RequestLog, SecurityEvent


class Command(LoggedCommand):
    help = 'Delete log rows that are past their keeping time.'

    def handle(self, *args, **options):
        now = timezone.now()
        for model, days in (
            (RequestLog, settings.REQUEST_LOG_KEEP_DAYS),
            (SecurityEvent, settings.SECURITY_LOG_KEEP_DAYS),
            (JobLog, settings.JOB_LOG_KEEP_DAYS),
        ):
            deleted, _ = model.objects.filter(created_at__lt=now - timedelta(days=days)).delete()
            self.stdout.write(f'{model.__name__}: deleted {deleted} rows older than {days} days.')
