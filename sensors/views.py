from datetime import timedelta
from django.db.models import Avg
from django.db.models.functions import TruncHour
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from batches.models import Batch
from .models import SensorReading
from .serializers import SensorReadingSerializer, SensorReadingCreateSerializer
from alerts.utils import check_sensor_alerts
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
        check_sensor_alerts(batch_id, reading.temperature, reading.humidity)
        return api_success(SensorReadingSerializer(reading).data, 'Sensor reading recorded.', 201)


class SensorChartView(APIView):
    """
    GET /api/sensors/chart?hours=24
    Returns hourly average temperature and humidity across all active batches.
    Used by the supervisor dashboard charts.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error('Forbidden.', 403)

        hours = min(int(request.query_params.get('hours', 24)), 168)
        since = timezone.now() - timedelta(hours=hours)

        rows = (
            SensorReading.objects
            .filter(timestamp__gte=since)
            .annotate(hour=TruncHour('timestamp'))
            .values('hour')
            .annotate(avg_temp=Avg('temperature'), avg_humidity=Avg('humidity'))
            .order_by('hour')
        )

        data = [
            {
                'hour': row['hour'].strftime('%H:%M'),
                'avg_temp': round(row['avg_temp'], 1) if row['avg_temp'] is not None else None,
                'avg_humidity': round(row['avg_humidity'], 1) if row['avg_humidity'] is not None else None,
            }
            for row in rows
        ]
        return api_success(data)


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
