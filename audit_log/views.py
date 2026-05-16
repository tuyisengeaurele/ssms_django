import csv
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from core.utils import api_error
from core.pagination import StandardPagination
from rest_framework.response import Response
from .models import AuditLog
from .serializers import AuditLogSerializer


class IsAdmin(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == 'ADMIN'


class AuditLogListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = AuditLog.objects.select_related('user').all()

        # Filters
        action   = request.query_params.get('action')
        resource = request.query_params.get('resource')
        user_id  = request.query_params.get('user')
        search   = request.query_params.get('search', '').strip()

        if action:
            qs = qs.filter(action=action.upper())
        if resource:
            qs = qs.filter(resource__iexact=resource)
        if user_id:
            qs = qs.filter(user_id=user_id)
        if search:
            qs = qs.filter(user_email__icontains=search) | qs.filter(detail__icontains=search)

        if request.query_params.get('export') == 'csv':
            return self._csv_response(qs)

        paginator = StandardPagination()
        page      = paginator.paginate_queryset(qs, request)
        serializer = AuditLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def _csv_response(self, qs):
        class Echo:
            def write(self, value): return value

        def rows():
            writer = csv.writer(Echo())
            yield writer.writerow(['ID', 'User Email', 'Action', 'Resource', 'Resource ID', 'Detail', 'IP Address', 'Timestamp'])
            for entry in qs.iterator(chunk_size=200):
                yield writer.writerow([
                    entry.id, entry.user_email, entry.action,
                    entry.resource, entry.resource_id, entry.detail,
                    entry.ip_address or '', entry.created_at.isoformat(),
                ])

        response = StreamingHttpResponse(rows(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit_log.csv"'
        return response
