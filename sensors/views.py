from datetime import timedelta
from django.db.models import Avg
from django.db.models.functions import TruncHour
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from batches.models import Batch
from .models import SensorReading, IoTDevice
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
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error('Forbidden.', 403)

        hours = min(int(request.query_params.get('hours', 24)), 168)
        since = timezone.now() - timedelta(hours=hours)

        qs = SensorReading.objects.filter(timestamp__gte=since)
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
        # ADMIN: no filter, sees all

        rows = (
            qs
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


def _serialize_device(device: IoTDevice) -> dict:
    """Shared serializer for IoTDevice — includes latest reading."""
    latest = (
        SensorReading.objects
        .filter(device=device)
        .order_by('-timestamp')
        .first()
    )
    return {
        'id':        device.id,
        'name':      device.name,
        'deviceKey': device.device_key,
        'farmId':    device.farm_id,
        'farmName':  device.farm.name if device.farm else None,
        'batchId':   device.batch_id,
        'location':  device.location,
        'status':    device.status,
        'lastSeen':  device.last_seen.isoformat() if device.last_seen else None,
        'isActive':  device.is_active,
        'createdAt': device.created_at.isoformat(),
        'latestReading': {
            'temperature': latest.temperature,
            'humidity':    latest.humidity,
            'timestamp':   latest.timestamp.isoformat(),
        } if latest else None,
    }


class IoTDeviceListView(APIView):
    """
    GET /api/devices
    Returns all IoT devices visible to the current user (role-scoped).
    FARMER → own farms. SUPERVISOR → cooperative farms. ADMIN → all.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = IoTDevice.objects.select_related('farm', 'batch').filter(is_active=True)

        if request.user.role == 'FARMER':
            qs = qs.filter(farm__owner=request.user)
        elif request.user.role == 'SUPERVISOR':
            if request.user.cooperative_id:
                qs = qs.filter(
                    farm__owner__cooperative_id=request.user.cooperative_id,
                    farm__owner__role='FARMER',
                )
            else:
                qs = qs.none()
        # ADMIN: no filter

        return api_success([_serialize_device(d) for d in qs.order_by('-last_seen')])


class IoTDeviceDetailView(APIView):
    """GET /api/devices/:id — device detail with last 20 readings."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            device = IoTDevice.objects.select_related('farm', 'batch').get(pk=pk, is_active=True)
        except IoTDevice.DoesNotExist:
            return api_error('Device not found.', 404)

        # Access control
        if request.user.role == 'FARMER' and (not device.farm or device.farm.owner_id != request.user.id):
            return api_error('Device not found.', 404)
        if request.user.role == 'SUPERVISOR':
            if not request.user.cooperative_id or not device.farm or \
               device.farm.owner.cooperative_id != request.user.cooperative_id:
                return api_error('Device not found.', 404)

        data = _serialize_device(device)
        readings = (
            SensorReading.objects
            .filter(device=device)
            .order_by('-timestamp')[:20]
        )
        data['recentReadings'] = [
            {
                'temperature': r.temperature,
                'humidity':    r.humidity,
                'timestamp':   r.timestamp.isoformat(),
            }
            for r in readings
        ]
        return api_success(data)
