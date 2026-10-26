import secrets
from datetime import timedelta

from django.db.models import Avg
from django.db.models.functions import TruncHour
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from alerts.utils import check_sensor_alerts
from core.access import get_batch_or_404, get_farm_or_404, scope_by_batch, scope_by_farm
from core.params import int_param
from core.utils import api_error, api_success

from .models import IoTDevice, SensorReading
from .serializers import SensorReadingCreateSerializer, SensorReadingSerializer


def _gen_device_key():
    return 'ssms-' + secrets.token_urlsafe(16)


class SensorReadingCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('FARMER', 'ADMIN', 'SUPERVISOR'):
            return api_error("You don't have permission to do that.", 403)

        serializer = SensorReadingCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)

        batch = get_batch_or_404(request.user, serializer.validated_data['batch_id'])
        batch_id = batch.pk

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
    Returns hourly average temperature and humidity across the batches the caller may see.
    Used by the supervisor dashboard charts.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error("You don't have permission to do that.", 403)

        hours = int_param(request, 'hours', 24, 1, 168)
        since = timezone.now() - timedelta(hours=hours)

        qs = scope_by_batch(request.user, SensorReading.objects.filter(timestamp__gte=since))

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
        get_batch_or_404(request.user, batch_id)

        readings = (
            SensorReading.objects
            .filter(batch_id=batch_id)
            .order_by('-timestamp')[:100]
        )
        return api_success(SensorReadingSerializer(readings, many=True).data)


def _serialize_device(device: IoTDevice) -> dict:
    """Shared serializer for IoTDevice, includes latest reading."""
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
    GET  /api/devices         , list (role-scoped, optional ?farm=<id> filter)
    POST /api/devices         , create device (ADMIN or SUPERVISOR only)
    """
    permission_classes = [IsAuthenticated]

    def _scoped_qs(self, user):
        return scope_by_farm(user, IoTDevice.objects.select_related('farm', 'batch').filter(is_active=True))

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
            return api_error("You don't have permission to do that.", 403)

        # The JSON parser turns farmId into farm_id, so read the underscored names (and accept both).
        data     = request.data
        name     = (data.get('name') or '').strip()
        farm_id  = (data.get('farm_id') or data.get('farmId') or '').strip()
        location = (data.get('location') or '').strip()
        dev_key  = (data.get('device_key') or data.get('deviceKey') or '').strip() or _gen_device_key()

        if not name:
            return api_error('Please give the device a name.', 400)
        if not farm_id:
            return api_error('Please choose a farm.', 400)

        farm = get_farm_or_404(request.user, farm_id)

        if IoTDevice.objects.filter(device_key=dev_key).exists():
            return api_error('A device with that key is already registered.', 409)

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
    GET    /api/devices/:id, device detail with last 20 readings
    DELETE /api/devices/:id, deactivate device (ADMIN or SUPERVISOR)
    """
    permission_classes = [IsAuthenticated]

    def _get_device(self, request, pk):
        """Return (device, None), or (None, a 404 response) when it is missing or out of scope."""
        device = scope_by_farm(
            request.user,
            IoTDevice.objects.select_related('farm', 'farm__owner', 'batch').filter(is_active=True),
        ).filter(pk=pk).first()
        if device is None:
            return None, api_error("We couldn't find that device.", 404)
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
            return api_error("You don't have permission to do that.", 403)

        device, err = self._get_device(request, pk)
        if err:
            return err

        device.is_active = False
        device.status    = IoTDevice.STATUS_OFFLINE
        device.save(update_fields=['is_active', 'status'])
        return api_success({'id': device.id}, 'Device removed.')
