"""What an admin needs to know to tell whether SSMS is working. Never a secret, never a web address, only words and numbers.

Two kinds of check sit side by side:
* live checks ask: the database and the disease check service answer, and sensors have reported lately;
* set-up checks look at the settings: email can log in, error reporting has an address, photo storage has a name.
  They say a thing is set up. They do not send a test message or upload a test photo.

"Not set up" is not a problem. A local machine is meant to print its emails and keep its errors to itself.
"""
import time
from datetime import timezone as dt_timezone

import httpx
from django.conf import settings
from django.db import connection
from django.db.models import Max
from django.utils import timezone

from alerts.models import AlertLog, AlertType
from contacts.models import ContactMessage
from sensors.devices import effective_status, offline_after
from sensors.models import IoTDevice, SensorReading

AI_TIMEOUT = 3.0
OK, PROBLEM, NOT_SET_UP = 'ok', 'problem', 'notSetUp'


def _ping_database() -> None:
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')


def _milliseconds(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def check_database() -> dict:
    started = time.perf_counter()
    try:
        _ping_database()
    except Exception:
        return {'key': 'database', 'status': PROBLEM, 'values': {}}
    return {'key': 'database', 'status': OK, 'values': {'ms': _milliseconds(started)}}


def check_ai_service() -> dict:
    """The disease check service answers its health route. The address it is asked on is never reported."""
    started = time.perf_counter()
    try:
        answer = httpx.get(f'{settings.AI_SERVICE_URL.rstrip("/")}/health', timeout=AI_TIMEOUT)
    except httpx.TimeoutException:
        return {'key': 'aiService', 'status': PROBLEM, 'values': {'reason': 'timeout'}}
    except Exception:
        return {'key': 'aiService', 'status': PROBLEM, 'values': {'reason': 'unreachable'}}
    if answer.status_code != 200:
        return {'key': 'aiService', 'status': PROBLEM, 'values': {'reason': 'badAnswer'}}
    return {'key': 'aiService', 'status': OK, 'values': {'ms': _milliseconds(started)}}


def check_email() -> dict:
    sends = 'smtp' in settings.EMAIL_BACKEND.lower() and bool(settings.EMAIL_HOST_USER) and bool(settings.EMAIL_HOST_PASSWORD)
    return {'key': 'email', 'status': OK if sends else NOT_SET_UP, 'values': {'sends': sends}}


def check_error_monitoring() -> dict:
    return {'key': 'errorMonitoring', 'status': OK if settings.SENTRY_DSN else NOT_SET_UP, 'values': {}}


def check_image_storage() -> dict:
    ready = bool(settings.CLOUDINARY_CLOUD_NAME) and bool(settings.CLOUDINARY_UPLOAD_PRESET)
    return {'key': 'imageStorage', 'status': OK if ready else NOT_SET_UP, 'values': {}}


def _aware(moment):
    """A time with its time zone. A column made by hand can hold times with none, and those were written as UTC."""
    if moment is not None and timezone.is_naive(moment):
        return moment.replace(tzinfo=dt_timezone.utc)
    return moment


def check_sensors(now) -> dict:
    """How many sensors are online, and whether anything at all has reported lately."""
    devices = list(IoTDevice.objects.filter(is_active=True).only('status', 'last_seen'))
    if not devices:
        return {'key': 'sensors', 'status': NOT_SET_UP, 'values': {}}
    online = sum(1 for d in devices if effective_status(d, now) == IoTDevice.STATUS_ONLINE)
    latest = _aware(SensorReading.objects.aggregate(latest=Max('timestamp'))['latest'])
    silent = int((now - latest).total_seconds() // 60) if latest else None
    quiet = latest is None or now - latest > offline_after()
    return {
        'key': 'sensors', 'status': PROBLEM if quiet else OK,
        'values': {
            'online': online, 'offline': len(devices) - online, 'never_seen': sum(1 for d in devices if d.last_seen is None),
            'last_reading_at': latest.isoformat() if latest else None, 'silent_minutes': silent,
        },
    }


def what_is_waiting() -> dict:
    return {
        'unread_alerts': AlertLog.objects.filter(is_read=False).count(),
        'open_air_alerts': AlertLog.objects.filter(
            type__in=[AlertType.TEMPERATURE, AlertType.HUMIDITY], resolved_at__isnull=True, room__is_active=True,
        ).count(),
        'unanswered_messages': ContactMessage.objects.filter(replied_at__isnull=True).count(),
    }


def run_checks() -> dict:
    now = timezone.now()
    checks = [check_database(), check_ai_service(), check_email(), check_error_monitoring(), check_image_storage(), check_sensors(now)]
    return {
        'checked_at': now.isoformat(),
        'overall': PROBLEM if any(c['status'] == PROBLEM for c in checks) else OK,
        'checks': checks,
        'numbers': what_is_waiting(),
    }
