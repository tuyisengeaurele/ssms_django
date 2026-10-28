from django.conf import settings
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.csvsafe import safe_writer
from core.pagination import StandardPagination

from .models import AuditLog
from .pdf import audit_pdf
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
        if request.query_params.get('export') == 'pdf':
            return self._pdf_response(qs, request.user, (action or '').upper(), resource or '', search)

        paginator = StandardPagination()
        page      = paginator.paginate_queryset(qs, request)
        serializer = AuditLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def _pdf_response(self, qs, user, action, resource, search):
        entries = list(qs.order_by('-created_at', '-id')[:settings.PDF_AUDIT_ROW_LIMIT])
        pdf = audit_pdf(entries, qs.count(), action, resource, search, user.name or user.email)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="audit_log_{timezone.now():%Y-%m-%d}.pdf"'
        return response

    def _csv_response(self, qs):
        class Echo:
            def write(self, value): return value

        def rows():
            writer = safe_writer(Echo())
            yield writer.writerow(['ID', 'User Name', 'User Email', 'Action', 'Resource', 'Resource ID', 'Detail', 'IP Address', 'Timestamp'])
            for entry in qs.iterator(chunk_size=200):
                yield writer.writerow([
                    entry.id, entry.user_name, entry.user_email, entry.action,
                    entry.resource, entry.resource_id, entry.detail,
                    entry.ip_address or '', entry.created_at.isoformat(),
                ])

        response = StreamingHttpResponse(rows(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit_log.csv"'
        return response
