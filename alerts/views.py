from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from batches.models import Batch
from .models import AlertLog
from .serializers import AlertLogSerializer
from core.utils import api_success, api_error
from core.pagination import StandardPagination


class AlertListView(APIView):
    """
    GET /api/alerts
    Returns all unread alerts across every batch (SUPERVISOR / ADMIN only).
    Optional query params:
      ?unread=true   — only unread (default)
      ?limit=N       — cap results (default 100)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error('Forbidden.', 403)

        unread_only = request.query_params.get('unread', 'true').lower() != 'false'
        limit = min(int(request.query_params.get('limit', 100)), 500)

        qs = AlertLog.objects.select_related('batch__farm__owner').order_by('-created_at')

        if request.user.role == 'FARMER':
            qs = qs.filter(batch__farm__owner=request.user)
        elif request.user.role == 'SUPERVISOR':
            if request.user.cooperative_id:
                qs = qs.filter(
                    batch__farm__owner__cooperative_id=request.user.cooperative_id,
                    batch__farm__owner__role='FARMER',
                )
            else:
                qs = qs.none()
        # ADMIN: no filter, sees everything

        if unread_only:
            qs = qs.filter(is_read=False)

        # If no explicit page param, fall back to legacy limit-based slice for SSE/widget calls
        if 'page' in request.query_params:
            paginator = StandardPagination()
            page = paginator.paginate_queryset(qs, request)
            if page is not None:
                return paginator.get_paginated_response(AlertLogSerializer(page, many=True).data)

        alerts = qs[:limit]
        return api_success(AlertLogSerializer(alerts, many=True).data)


class AlertMarkAllReadView(APIView):
    """POST /api/alerts/mark-all-read — mark every unread alert as read."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error('Forbidden.', 403)

        qs = AlertLog.objects.filter(is_read=False)
        if request.user.role == 'SUPERVISOR':
            if request.user.cooperative_id:
                qs = qs.filter(
                    batch__farm__owner__cooperative_id=request.user.cooperative_id,
                    batch__farm__owner__role='FARMER',
                )
            else:
                qs = qs.none()
        # ADMIN: mark all system-wide

        updated = qs.update(is_read=True)
        return api_success({'updated': updated}, f'{updated} alert(s) marked as read.')


class AlertsByBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        try:
            Batch.objects.get(pk=batch_id, is_active=True)
        except Batch.DoesNotExist:
            return api_error('Batch not found.', 404)

        alerts = AlertLog.objects.select_related('batch__farm__owner').filter(batch_id=batch_id).order_by('-created_at')
        return api_success(AlertLogSerializer(alerts, many=True).data)


class AlertMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            alert = AlertLog.objects.select_related('batch__farm__owner').get(pk=pk)
        except AlertLog.DoesNotExist:
            return api_error('Alert not found.', 404)

        alert.is_read = True
        alert.save(update_fields=['is_read'])
        return api_success(AlertLogSerializer(alert).data, 'Alert marked as read.')
