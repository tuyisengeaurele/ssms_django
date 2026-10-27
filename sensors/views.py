import secrets
from datetime import timedelta

from django.db.models import Avg
from django.db.models.functions import TruncHour
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from alerts.utils import check_room_alerts
from audit_log.utils import log_action
from core.access import get_batch_or_404, get_farm_or_404, scope_by_farm, scope_readings
from core.params import int_param
from core.throttles import DeviceKeyThrottle
from core.utils import api_error, api_success
from farms.models import RearingRoom

from .devices import effective_status, record_device_reading, room_for_device
from .models import IoTDevice, SensorReading
from .room_readings import readings_for_batch
from .serializers import DeviceReadingSerializer, SensorReadingCreateSerializer, SensorReadingSerializer

CHOOSE_ROOM = "Please choose one of this farm's rooms."


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

        # A reading belongs to the room it is taken in, and every batch in that room shares it. A batch that was never
        # placed in a room keeps the old way, a reading of its own.
        reading = SensorReading.objects.create(
            room_id=batch.room_id,
            batch=None if batch.room_id else batch,
            temperature=serializer.validated_data['temperature'],
            humidity=serializer.validated_data['humidity'],
        )
        # A batch with no room has no environment to judge, so only a placed batch raises alerts.
        if batch.room_id:
            check_room_alerts(batch.room_id, reading.temperature, reading.humidity)
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

        qs = scope_readings(request.user, SensorReading.objects.filter(timestamp__gte=since))

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
        batch = get_batch_or_404(request.user, batch_id)

        readings = readings_for_batch(batch).order_by('-timestamp')[:100]
        return api_success(SensorReadingSerializer(readings, many=True).data)


class SensorBatchSeriesView(APIView):
    """
    GET /api/sensors/batch/<id>/series?hours=N, the readings of one batch over the last N hours (1 to 720).
    Readings are averaged into hourly buckets, or six hour buckets for more than a week, so a month still
    draws as a short line. Oldest first.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        batch = get_batch_or_404(request.user, batch_id)
        hours = int_param(request, 'hours', 24, 1, 720)
        bucket_hours = 1 if hours <= 168 else 6
        since = timezone.now() - timedelta(hours=hours)

        rows = (
            readings_for_batch(batch)
            .filter(timestamp__gte=since)
            .order_by('timestamp')
            .values_list('timestamp', 'temperature', 'humidity')
        )
        buckets = {}
        for stamp, temperature, humidity in rows:
            start = stamp.replace(minute=0, second=0, microsecond=0)
            start = start.replace(hour=start.hour // bucket_hours * bucket_hours)
            total = buckets.setdefault(start, [0.0, 0.0, 0])
            total[0] += temperature
            total[1] += humidity
            total[2] += 1

        return api_success([
            {
                'timestamp': start.isoformat(),
                'temperature': round(temp_sum / count, 1),
                'humidity': round(hum_sum / count, 1),
                'count': count,
            }
            for start, (temp_sum, hum_sum, count) in sorted(buckets.items())
        ])


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
        'room':      {'id': device.room_id, 'name': device.room.name} if device.room_id and device.room.is_active else None,
        'location':  device.location,
        'status':    effective_status(device),
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
        return scope_by_farm(user, IoTDevice.objects.select_related('farm', 'batch', 'room').filter(is_active=True))

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

        rooms = list(RearingRoom.objects.filter(farm=farm, is_active=True))
        room_id = (data.get('room_id') or data.get('roomId') or '').strip()
        if room_id:
            room = next((r for r in rooms if r.pk == room_id), None)
            if room is None:
                return api_error(CHOOSE_ROOM, 422, {'room_id': [CHOOSE_ROOM]})
        else:
            # A farm with one room has nothing to decide. Otherwise the device waits to be placed.
            room = rooms[0] if len(rooms) == 1 else None

        device = IoTDevice.objects.create(
            name=name,
            device_key=dev_key,
            farm=farm,
            room=room,
            location=location,
            status=IoTDevice.STATUS_OFFLINE,
            is_active=True,
        )
        return api_success(_serialize_device(device), 'Device registered.', 201)


class IoTDeviceDetailView(APIView):
    """
    GET    /api/devices/:id, device detail with last 20 readings
    PATCH  /api/devices/:id, move the device to another room of its farm (ADMIN or SUPERVISOR)
    DELETE /api/devices/:id, deactivate device (ADMIN or SUPERVISOR)
    """
    permission_classes = [IsAuthenticated]

    def _get_device(self, request, pk):
        """Return (device, None), or (None, a 404 response) when it is missing or out of scope."""
        device = scope_by_farm(
            request.user,
            IoTDevice.objects.select_related('farm', 'farm__owner', 'batch', 'room').filter(is_active=True),
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

    def patch(self, request, pk):
        if request.user.role not in ('ADMIN', 'SUPERVISOR'):
            return api_error("You don't have permission to do that.", 403)
        device, err = self._get_device(request, pk)
        if err:
            return err
        room = RearingRoom.objects.filter(pk=request.data.get('room_id') or '', farm_id=device.farm_id, is_active=True).first()
        if room is None:
            return api_error(CHOOSE_ROOM, 422, {'room_id': [CHOOSE_ROOM]})
        device.room = room
        device.save(update_fields=['room'])
        log_action(request, 'UPDATE', 'Device', device.pk, f'Moved device {device.name} to {room.name}')
        return api_success(_serialize_device(device), 'Device moved.')

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


class DeviceIngestView(APIView):
    """
    POST /api/devices/ingest, a device sends one reading. The device key goes in the X-Device-Key header.
    No user account is involved, so the usual sign in does not apply.
    """
    authentication_classes = []
    permission_classes = [AllowAny]
    # Per key, and per address too, because a key an admin chose by hand could be guessed.
    throttle_classes = [DeviceKeyThrottle, AnonRateThrottle]

    def post(self, request):
        key = request.headers.get('X-Device-Key', '').strip()
        device = IoTDevice.objects.select_related('farm', 'room').filter(device_key=key, is_active=True).first() if key else None
        # One message for a missing, wrong or switched off key, and for a device whose room was deleted, so it says
        # nothing about which keys exist.
        if device is None or (device.room_id and not device.room.is_active):
            return api_error("That device key isn't valid.", 401)

        serializer = DeviceReadingSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check the reading and try again.', 422, serializer.errors)

        room = room_for_device(device)
        if room is None:
            return api_error('This device is not in a room yet.', 409)

        record_device_reading(device, room, serializer.validated_data['temperature'], serializer.validated_data['humidity'])
        return api_success(None, 'Reading recorded.', 201)
