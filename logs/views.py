from datetime import timedelta

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from audit_log.models import AuditLog
from audit_log.utils import log_action
from core.csvsafe import safe_writer
from core.pagination import StandardPagination
from core.permissions import RolePermission
from core.throttles import ExportRateThrottle
from core.utils import api_error

from .streams import STREAMS

# Looking at the same log again within this long is one look, so changing a filter does not fill the audit log.
ONE_LOOK = timedelta(seconds=60)


class LogsView(APIView):
    """GET /api/admin/logs/<stream>: audit, security, requests or jobs. Admins only, and every look is written down."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'logs'
    throttle_classes = [UserRateThrottle, ExportRateThrottle]

    def get(self, request, stream):
        found = STREAMS.get(stream)
        if found is None:
            return api_error("We couldn't find that log.", 404)
        rows = found.filter(found.queryset(), request)
        exporting = request.query_params.get('export') == 'csv'
        self._note(request, found, exporting)
        if exporting:
            return self._csv(found, rows)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(rows, request)
        return paginator.get_paginated_response([found.serialize(r) for r in page])

    @staticmethod
    def _note(request, found, exporting):
        if exporting:
            log_action(request, 'OTHER', 'Logs', found.name, f'Exported the {found.name} log as CSV')
            return
        recent = AuditLog.objects.filter(
            user=request.user, resource='Logs', resource_id=found.name, detail__startswith='Looked at',
            created_at__gte=timezone.now() - ONE_LOOK,
        ).exists()
        if not recent:
            used = found.filters_used(request)
            suffix = f' with filters: {", ".join(used)}' if used else ''
            log_action(request, 'OTHER', 'Logs', found.name, f'Looked at the {found.name} log{suffix}')

    @staticmethod
    def _csv(found, rows):
        class Echo:
            def write(self, value):
                return value

        def lines():
            writer = safe_writer(Echo())
            yield writer.writerow(found.csv_header)
            for row in rows.iterator(chunk_size=200):
                yield writer.writerow(found.csv_row(row))

        response = StreamingHttpResponse(lines(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{found.name}_log.csv"'
        return response
