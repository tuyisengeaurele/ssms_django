"""GET /api/admin/health: whether SSMS is working. Admin only. It reads and reports, and changes nothing."""
import time
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.health import run_checks
from core.health_tests import TESTS
from core.permissions import RolePermission
from core.throttles import HealthTestRateThrottle
from core.utils import api_error, api_success
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


class SystemHealthTestView(APIView):
    """POST /api/admin/health/tests/<name>: press one test button. Admins only, 5 a minute, and written in the audit log.

    The answer is a plain code the screen puts into words. It never carries an address, a key or the text of an error.
    """
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'system_health'
    actions = {'post': 'test'}
    throttle_classes = [UserRateThrottle, HealthTestRateThrottle]

    def post(self, request, name):
        test = TESTS.get(name)
        if test is None:
            return api_error("We couldn't find that test.", 404)
        started = time.perf_counter()
        result = test(request.user)
        milliseconds = int((time.perf_counter() - started) * 1000)
        log_action(
            request, 'OTHER', 'HealthTest', name, f'Ran the {name} test: {result["outcome"]}',
            outcome='success' if result['ok'] else 'failure',
        )
        return api_success({
            'name': name, 'ok': result['ok'], 'outcome': result['outcome'],
            'milliseconds': milliseconds, 'ran_at': timezone.now(),
        })


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
