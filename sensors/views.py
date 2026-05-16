import random
import string
from datetime import timedelta
from django.db.models import Avg
from django.db.models.functions import TruncHour
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from batches.models import Batch
from farms.models import Farm
from .models import SensorReading, IoTDevice
from .serializers import SensorReadingSerializer, SensorReadingCreateSerializer
from alerts.utils import check_sensor_alerts
from core.utils import api_success, api_error


def _gen_device_key():
    chars = string.ascii_lowercase + string.digits
    return 'ssms-' + ''.join(random.choices(chars, k=12))


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
    GET  /api/devices          — list (role-scoped, optional ?farm=<id> filter)
    POST /api/devices          — create device (ADMIN or SUPERVISOR only)
    """
    permission_classes = [IsAuthenticated]

    def _scoped_qs(self, user):
        qs = IoTDevice.objects.select_related('farm', 'batch').filter(is_active=True)
        if user.role == 'FARMER':
            qs = qs.filter(farm__owner=user)
        elif user.role == 'SUPERVISOR':
            if user.cooperative_id:
                qs = qs.filter(
                    farm__owner__cooperative_id=user.cooperative_id,
                    farm__owner__role='FARMER',
                )
            else:
                qs = qs.none()
        # ADMIN: no filter
        return qs

    def get(self, request):
        qs = self._scoped_qs(request.user)

        # Optional farm filter
        farm_id = request.query_params.get('farm')
        if farm_id:
            qs = qs.filter(farm_id=farm_id)

        return api_success([_serialize_device(d) for d in qs.order_by('-last_seen')])

    def post(self, request):
        """Create a new IoT device for a farm (ADMIN or SUPERVISOR)."""
        if request.user.role not in ('ADMIN', 'SUPERVISOR'):
            return api_error('Admin or Supervisor access required.', 403)

        name     = (request.data.get('name') or '').strip()
        farm_id  = (request.data.get('farmId') or '').strip()
        location = (request.data.get('location') or '').strip()
        dev_key  = (request.data.get('deviceKey') or '').strip() or _gen_device_key()

        if not name:
            return api_error('Device name is required.', 400)
        if not farm_id:
            return api_error('Farm ID is required.', 400)

        # Scope: supervisor can only assign to farms in their cooperative
        try:
            farm = Farm.objects.get(pk=farm_id, is_active=True)
        except Farm.DoesNotExist:
            return api_error('Farm not found.', 404)

        if request.user.role == 'SUPERVISOR':
            if (not request.user.cooperative_id or
                    farm.owner.cooperative_id != request.user.cooperative_id):
                return api_error('Farm not in your cooperative.', 403)

        if IoTDevice.objects.filter(device_key=dev_key).exists():
            return api_error('A device with that key already exists.', 409)

        device = IoTDevice.objects.create(
            name=name,
            device_key=dev_key,
            farm=farm,
            location=location,
            status=IoTDevice.STATUS_OFFLINE,
            is_active=True,
        )
        return api_success(_serialize_device(device), 'Device registered.', 201)


class IoTDeviceDetailView(APIView):
    """
    GET    /api/devices/:id — device detail with last 20 readings
    DELETE /api/devices/:id — deactivate device (ADMIN or SUPERVISOR)
    """
    permission_classes = [IsAuthenticated]

    def _get_device(self, request, pk):
        """Return device or raise 404/403 dict."""
        try:
            device = IoTDevice.objects.select_related('farm', 'farm__owner', 'batch').get(pk=pk, is_active=True)
        except IoTDevice.DoesNotExist:
            return None, api_error('Device not found.', 404)

        if request.user.role == 'FARMER' and (not device.farm or device.farm.owner_id != request.user.id):
            return None, api_error('Device not found.', 404)
        if request.user.role == 'SUPERVISOR':
            if not request.user.cooperative_id or not device.farm or \
               device.farm.owner.cooperative_id != request.user.cooperative_id:
                return None, api_error('Device not found.', 404)
        return device, None

    def get(self, request, pk):
        device, err = self._get_device(request, pk)
        if err:
            return err

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

    def delete(self, request, pk):
        if request.user.role not in ('ADMIN', 'SUPERVISOR'):
            return api_error('Admin or Supervisor access required.', 403)

        device, err = self._get_device(request, pk)
        if err:
            return err

        device.is_active = False
        device.status    = IoTDevice.STATUS_OFFLINE
        device.save(update_fields=['is_active', 'status'])
        return api_success({'id': device.id}, 'Device removed.')
