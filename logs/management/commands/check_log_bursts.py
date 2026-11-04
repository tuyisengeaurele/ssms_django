"""
Management command: check_log_bursts
Mails the admins once when server errors or refusals in the last few minutes pass a limit. Run it every 5 minutes.

    python manage.py check_log_bursts

The limits are LOG_BURST_SERVER_ERRORS (10) and LOG_BURST_REFUSALS (30) within LOG_BURST_MINUTES (5). After a mail the
command stays quiet for LOG_BURST_QUIET_MINUTES (30), so one bad hour is one mail.
"""
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from core.mail import Email, send_email
from logs.jobs import LoggedCommand, record_job
from logs.models import RequestLog, SecurityEvent
from users.models import User

QUIET_KEY = 'log-burst-mailed'


class Command(LoggedCommand):
    help = 'Mail the admins once when server errors or refusals come in a burst.'

    def handle(self, *args, **options):
        since = timezone.now() - timedelta(minutes=settings.LOG_BURST_MINUTES)
        server_errors = RequestLog.objects.filter(status__gte=500, created_at__gte=since).count()
        refusals = SecurityEvent.objects.filter(kind='permission_denied', created_at__gte=since).count()
        burst = server_errors >= settings.LOG_BURST_SERVER_ERRORS or refusals >= settings.LOG_BURST_REFUSALS
        if not burst:
            self.stdout.write('No burst.')
            return

        admins = list(User.objects.filter(role='ADMIN', is_active=True).values_list('email', flat=True))
        if not admins:
            self.stdout.write('A burst, but there is no admin to tell.')
            return
        # One burst is one mail. The note lives in the cache, so it needs no table of its own.
        if not cache.add(QUIET_KEY, 1, timeout=settings.LOG_BURST_QUIET_MINUTES * 60):
            self.stdout.write('A burst, but the admins were told a short while ago.')
            return

        minutes = settings.LOG_BURST_MINUTES
        site = settings.FRONTEND_URL.rstrip('/')
        send_email(
            f'SSMS: {server_errors} server errors and {refusals} refusals in {minutes} minutes',
            admins,
            Email(
                heading='Something may be wrong with SSMS',
                reason='You received this because you are an admin of SSMS.',
                greeting='Hello,',
                intro=(f'In the last {minutes} minutes the server logged more failures than usual.',),
                facts=(('Server errors', str(server_errors)), ('Refusals for the role', str(refusals))),
                button=('Open the logs', f'{site}/admin/system/logs?stream=requests'),
                closing=('In SSMS open System, then Logs. The Requests log shows each failure with a reference you can search in the others.',),
            ),
            fail_silently=True,
        )
        record_job('burst_alert', 'Burst of failures', f'{server_errors} server errors, {refusals} refusals in {minutes} minutes')
        self.stdout.write(self.style.WARNING(f'Told {len(admins)} admin(s): {server_errors} server errors, {refusals} refusals.'))
