"""What happens when a device sends a reading, and when it goes quiet."""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from alerts.models import AlertLog
from alerts.utils import check_sensor_alerts
from batches.models import Batch

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


def batch_for_device(device: IoTDevice):
    """The batch a reading belongs to: the device's own batch, or the only active batch on its farm."""
    if device.batch_id:
        return device.batch if device.batch.is_active else None
    batches = list(Batch.objects.filter(farm_id=device.farm_id, is_active=True)[:2])
    return batches[0] if len(batches) == 1 else None


def record_device_reading(device: IoTDevice, batch: Batch, temperature: float, humidity: float) -> SensorReading:
    now = timezone.now()
    with transaction.atomic():
        reading = SensorReading.objects.create(batch=batch, device=device, temperature=temperature, humidity=humidity)
        device.status = IoTDevice.STATUS_ONLINE
        device.last_seen = now
        device.save(update_fields=['status', 'last_seen'])
        # Hearing from the device again ends its outage.
        AlertLog.objects.filter(
            batch=batch, type='SYSTEM', resolved_at__isnull=True, message__startswith=_offline_prefix(device),
        ).update(resolved_at=now)
    check_sensor_alerts(batch.pk, temperature, humidity)
    return reading


def mark_offline_devices(now=None) -> list[IoTDevice]:
    """Switch quiet devices to offline and open one system alert per outage on their batch."""
    now = now or timezone.now()
    minutes = settings.DEVICE_OFFLINE_MINUTES
    quiet = (
        IoTDevice.objects
        .filter(is_active=True, status=IoTDevice.STATUS_ONLINE)
        .filter(Q(last_seen__lt=now - offline_after()) | Q(last_seen__isnull=True))
        .select_related('batch')
    )
    changed = []
    for device in quiet:
        device.status = IoTDevice.STATUS_OFFLINE
        device.save(update_fields=['status'])
        changed.append(device)

        batch = device.batch
        if batch is None or not batch.is_active:
            continue
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
