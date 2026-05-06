from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from batches.models import Batch
from .models import AlertLog
from .serializers import AlertLogSerializer
from core.utils import api_success, api_error


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
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error('Forbidden. Supervisors and admins only.', 403)

        unread_only = request.query_params.get('unread', 'true').lower() != 'false'
        limit = min(int(request.query_params.get('limit', 100)), 500)

        qs = AlertLog.objects.order_by('-created_at')
        if unread_only:
            qs = qs.filter(is_read=False)
        alerts = qs[:limit]
        return api_success(AlertLogSerializer(alerts, many=True).data)


class AlertMarkAllReadView(APIView):
    """POST /api/alerts/mark-all-read — mark every unread alert as read."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error('Forbidden.', 403)
        updated = AlertLog.objects.filter(is_read=False).update(is_read=True)
        return api_success({'updated': updated}, f'{updated} alert(s) marked as read.')


class AlertsByBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        try:
            Batch.objects.get(pk=batch_id, is_active=True)
        except Batch.DoesNotExist:
            return api_error('Batch not found.', 404)

        alerts = AlertLog.objects.filter(batch_id=batch_id).order_by('-created_at')
        return api_success(AlertLogSerializer(alerts, many=True).data)


class AlertMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            alert = AlertLog.objects.get(pk=pk)
        except AlertLog.DoesNotExist:
            return api_error('Alert not found.', 404)

        alert.is_read = True
        alert.save(update_fields=['is_read'])
        return api_success(AlertLogSerializer(alert).data, 'Alert marked as read.')
