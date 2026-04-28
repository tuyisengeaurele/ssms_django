from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from batches.models import Batch
from .models import AlertLog
from .serializers import AlertLogSerializer
from core.utils import api_success, api_error


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
