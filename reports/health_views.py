"""GET /api/admin/health: whether SSMS is working. Admin only. It reads and reports, and changes nothing."""
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.health import run_checks
from core.permissions import RolePermission
from core.utils import api_success
from logs.models import HealthCheckResult
from logs.uptime import uptime_from_counts

# Every service the checks cover, in the order the page shows them.
SERVICES = (
    'web', 'database', 'aiService', 'email', 'errorMonitoring', 'imageStorage', 'sensors', 'jobs', 'alertStream', 'website',
)
WINDOWS = {'day': timedelta(hours=24), 'week': timedelta(days=7), 'month': timedelta(days=30)}


class SystemHealthView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'system_health'

    def get(self, request):
        return api_success(run_checks())


class SystemHealthHistoryView(APIView):
    """GET /api/admin/health/history: the last 24 hours of results and the uptime over a day, a week and a month.

    It reads what `run_health_checks` wrote and runs no check of its own, so it is quick and can be asked often.
    """
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'system_health'

    def get(self, request):
        now = timezone.now()
        services = {key: {'points': [], 'uptime': {}} for key in SERVICES}

        recent = HealthCheckResult.objects.filter(checked_at__gte=now - WINDOWS['day']).order_by('checked_at')
        for row in recent.values('service', 'status', 'milliseconds', 'checked_at'):
            if row['service'] in services:
                services[row['service']]['points'].append(
                    {'at': row['checked_at'], 'status': row['status'], 'ms': row['milliseconds']},
                )

        for name, window in WINDOWS.items():
            counts = {}
            tallies = HealthCheckResult.objects.filter(checked_at__gte=now - window).values('service', 'status').annotate(n=Count('id'))
            for tally in tallies:
                counts.setdefault(tally['service'], {})[tally['status']] = tally['n']
            for key in SERVICES:
                found = counts.get(key, {})
                services[key]['uptime'][name] = uptime_from_counts(found.get('ok', 0), found.get('problem', 0), window)
        return api_success({'services': services})
