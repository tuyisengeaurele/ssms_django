"""What happens when a device sends a reading, and when it goes quiet."""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from alerts.models import AlertLog
from alerts.utils import check_sensor_alerts
from batches.models import Batch
from farms.models import RearingRoom

from .models import IoTDevice, SensorReading


def offline_after() -> timedelta:
    return timedelta(minutes=settings.DEVICE_OFFLINE_MINUTES)


def effective_status(device: IoTDevice, now=None) -> str:
    """The status to show. A device that says it is online but has been quiet too long is offline,
    so the screens are right even when the cleanup job has not run yet."""
    now = now or timezone.now()
    if device.status == IoTDevice.STATUS_ONLINE and (device.last_seen is None or device.last_seen < now - offline_after()):
        return IoTDevice.STATUS_OFFLINE
    return device.status


def _offline_prefix(device: IoTDevice) -> str:
    return f'Device {device.name} has not sent data'


def check_room_alerts(room_id: str, temperature: float, humidity: float) -> list:
    """Judge a room's reading for each active batch in it. For now each batch keeps its own alert, and the next step
    moves alerts to the room itself."""
    opened = []
    for batch_id in Batch.objects.filter(room_id=room_id, is_active=True).values_list('pk', flat=True):
        opened += check_sensor_alerts(batch_id, temperature, humidity)
    return opened


def room_for_device(device: IoTDevice):
    """The room a device's readings go to, or None when it has none.

    A device in a room uses that room. A device that was never placed uses the only room of its farm. A deleted room
    gives None too, and the caller tells it apart by checking `device.room` first.
    """
    if device.room_id:
        return device.room if device.room.is_active else None
    rooms = list(RearingRoom.objects.filter(farm_id=device.farm_id, is_active=True)[:2])
    return rooms[0] if len(rooms) == 1 else None


def _batches_in(room_id):
    return Batch.objects.filter(room_id=room_id, is_active=True)


def record_device_reading(device: IoTDevice, room: RearingRoom, temperature: float, humidity: float) -> SensorReading:
    now = timezone.now()
    with transaction.atomic():
        reading = SensorReading.objects.create(room=room, device=device, temperature=temperature, humidity=humidity)
        device.status = IoTDevice.STATUS_ONLINE
        device.last_seen = now
        device.save(update_fields=['status', 'last_seen'])
        # Hearing from the device again ends its outage for every batch in the room.
        AlertLog.objects.filter(
            batch__in=_batches_in(room.pk), type='SYSTEM', resolved_at__isnull=True,
            message__startswith=_offline_prefix(device),
        ).update(resolved_at=now)
    check_room_alerts(room.pk, temperature, humidity)
    return reading


def mark_offline_devices(now=None) -> list[IoTDevice]:
    """Switch quiet devices to offline and open one system alert per outage on their batch."""
    now = now or timezone.now()
    minutes = settings.DEVICE_OFFLINE_MINUTES
    quiet = (
        IoTDevice.objects
        .filter(is_active=True, status=IoTDevice.STATUS_ONLINE)
        .filter(Q(last_seen__lt=now - offline_after()) | Q(last_seen__isnull=True))
        .select_related('room')
    )
    changed = []
    for device in quiet:
        device.status = IoTDevice.STATUS_OFFLINE
        device.save(update_fields=['status'])
        changed.append(device)

        if device.room_id is None:
            continue
        for batch in _batches_in(device.room_id):
            already_open = AlertLog.objects.filter(
                batch=batch, type='SYSTEM', resolved_at__isnull=True, message__startswith=_offline_prefix(device),
            ).exists()
            if not already_open:
                AlertLog.objects.create(
                    batch=batch,
                    type='SYSTEM',
                    message=f'{_offline_prefix(device)} for {minutes} minutes. Check its power and connection.',
                )
    return changed
