"""
Management command: run_health_checks
Asks every service how it is and writes one row each, so the System page can show history and uptime. Run it every 5 minutes.

    python manage.py run_health_checks
    python manage.py run_health_checks --skip aiService
    python manage.py run_health_checks --skip aiService --awake-hours-utc 4-18

--skip leaves a service out, so a scheduled run does not wake a free host that sleeps when idle.

--awake-hours-utc START-END checks the API only from START up to, not including, END (whole hours in UTC, and the
window may wrap midnight). Outside it the API is left alone and can sleep. A free Render account has 750 instance
hours a month for all its services, and an API pinged all night uses nearly all of them.

The API cannot report its own downtime, so an outside monitor should ping /api/health as well. Rows are kept 30 days.
"""
from django.core.management.base import CommandError
from django.utils import timezone

from core.health import SERVICE_KEYS, run_checks
from logs.jobs import LoggedCommand
from logs.models import HealthCheckResult


def in_awake_window(window: str, hour: int) -> bool:
    """Is this UTC hour inside "START-END"? START is inside, END is not. Raises ValueError for anything but two different hours 0 to 23."""
    parts = window.split('-')
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        raise ValueError(f'"{window}" is not a window like 4-18.')
    start, end = int(parts[0]), int(parts[1])
    if not (0 <= start <= 23 and 0 <= end <= 23) or start == end:
        raise ValueError(f'"{window}" needs two different hours from 0 to 23.')
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end


class Command(LoggedCommand):
    help = 'Check every service and write one result row for each.'

    def add_arguments(self, parser):
        parser.add_argument('--skip', action='append', default=[], metavar='SERVICE',
                            help='Leave this service out of the run. Can be given more than once.')
        parser.add_argument('--awake-hours-utc', metavar='START-END', default=None,
                            help='Check the API only inside these UTC hours, for example 4-18. Outside them it is left to sleep.')

    def handle(self, *args, **options):
        unknown = [name for name in options['skip'] if name not in SERVICE_KEYS]
        if unknown:
            raise CommandError(f'Unknown service {", ".join(unknown)}. Choose from: {", ".join(SERVICE_KEYS)}.')
        now = timezone.now()
        skip = list(options['skip'])
        window = options['awake_hours_utc']
        if window is not None:
            try:
                awake = in_awake_window(window, now.hour)
            except ValueError as error:
                raise CommandError(str(error)) from error
            if not awake and 'web' not in skip:
                skip.append('web')
        report = run_checks(skip=skip)
        rows = []
        for check in report['checks']:
            values = check['values']
            rows.append(HealthCheckResult(
                service=check['key'], status=check['status'], milliseconds=values.get('ms'),
                reason=str(values.get('reason') or '')[:40], checked_at=now,
            ))
        HealthCheckResult.objects.bulk_create(rows)
        problems = [r.service for r in rows if r.status == 'problem']
        self.stdout.write(f'Wrote {len(rows)} results. Problems: {", ".join(problems) if problems else "none"}.')
