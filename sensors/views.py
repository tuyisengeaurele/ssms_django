from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from batches.models import Batch
from .models import SensorReading
from .serializers import SensorReadingSerializer, SensorReadingCreateSerializer
from core.utils import api_success, api_error


class SensorReadingCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('FARMER', 'ADMIN', 'SUPERVISOR'):
            return api_error('Forbidden. Insufficient permissions.', 403)

        serializer = SensorReadingCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)

        batch_id = serializer.validated_data['batch_id']
        try:
            Batch.objects.get(pk=batch_id, is_active=True)
        except Batch.DoesNotExist:
            return api_error('Batch not found.', 404)

        reading = SensorReading.objects.create(
            batch_id=batch_id,
            temperature=serializer.validated_data['temperature'],
            humidity=serializer.validated_data['humidity'],
        )
        return api_success(SensorReadingSerializer(reading).data, 'Sensor reading recorded.', 201)


class SensorReadingByBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        try:
            Batch.objects.get(pk=batch_id, is_active=True)
        except Batch.DoesNotExist:
            return api_error('Batch not found.', 404)

        readings = (
            SensorReading.objects
            .filter(batch_id=batch_id)
            .order_by('-timestamp')[:100]
        )
        return api_success(SensorReadingSerializer(readings, many=True).data)
