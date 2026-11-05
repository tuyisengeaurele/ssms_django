"""
Management command: run_health_checks
Asks every service how it is and writes one row each, so the System page can show history and uptime. Run it every 5 minutes.

    python manage.py run_health_checks

The API cannot report its own downtime, so an outside monitor should ping /api/health as well. Rows are kept 30 days.
"""
from django.utils import timezone

from core.health import run_checks
from logs.jobs import LoggedCommand
from logs.models import HealthCheckResult


class Command(LoggedCommand):
    help = 'Check every service and write one result row for each.'

    def handle(self, *args, **options):
        now = timezone.now()
        report = run_checks()
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
