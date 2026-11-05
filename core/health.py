"""What an admin needs to know to tell whether SSMS is working. Never a secret, never a web address, only words and numbers.

Two kinds of check sit side by side:
* live checks ask: the database and the disease check service answer, and sensors have reported lately;
* set-up checks look at the settings: email can log in, error reporting has an address, photo storage has a name.
  They say a thing is set up. They do not send a test message or upload a test photo.

"Not set up" is not a problem. A local machine is meant to print its emails and keep its errors to itself.
"""
import asyncio
import logging
import time
from datetime import timedelta
from datetime import timezone as dt_timezone
from urllib.parse import urlparse

import httpx
from asgiref.sync import async_to_sync
from django.conf import settings
from django.db import connection
from django.db.models import Max
from django.utils import timezone

from alerts.models import AlertLog, AlertType
from contacts.models import ContactMessage
from logs.models import JobLog
from sensors.devices import effective_status, offline_after
from sensors.models import IoTDevice, SensorReading

AI_TIMEOUT = 3.0
WEBSITE_TIMEOUT = 3.0
STREAM_WAIT_SECONDS = 3.0
# The commands the scheduler runs every night. One of them finishing lately says the scheduler is alive.
NIGHTLY_COMMANDS = ('cleanup_sensor_readings', 'prune_sessions', 'prune_logs')
logger = logging.getLogger(__name__)
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


def _is_local(url: str) -> bool:
    host = (urlparse(url).hostname or '').lower()
    return host in ('', 'localhost', '127.0.0.1', '::1', '0.0.0.0') or host.endswith('.localhost')


def check_website() -> dict:
    """The website answers a HEAD request. A local machine has no public website, so there it is not set up."""
    url = settings.FRONTEND_URL
    if not url or _is_local(url):
        return {'key': 'website', 'status': NOT_SET_UP, 'values': {}}
    started = time.perf_counter()
    try:
        answer = httpx.head(url, timeout=WEBSITE_TIMEOUT, follow_redirects=True)
    except httpx.TimeoutException:
        return {'key': 'website', 'status': PROBLEM, 'values': {'reason': 'timeout'}}
    except Exception:
        return {'key': 'website', 'status': PROBLEM, 'values': {'reason': 'unreachable'}}
    if answer.status_code >= 400:
        return {'key': 'website', 'status': PROBLEM, 'values': {'reason': 'badAnswer'}}
    return {'key': 'website', 'status': OK, 'values': {'ms': _milliseconds(started)}}


def check_web() -> dict:
    """The API answers on its own public address. It cannot report its own downtime, so this runs from outside."""
    base = settings.HEALTH_API_URL.rstrip('/')
    if not base:
        return {'key': 'web', 'status': NOT_SET_UP, 'values': {}}
    started = time.perf_counter()
    try:
        answer = httpx.get(f'{base}/api/health', timeout=WEBSITE_TIMEOUT)
    except httpx.TimeoutException:
        return {'key': 'web', 'status': PROBLEM, 'values': {'reason': 'timeout'}}
    except Exception:
        return {'key': 'web', 'status': PROBLEM, 'values': {'reason': 'unreachable'}}
    if answer.status_code != 200:
        return {'key': 'web', 'status': PROBLEM, 'values': {'reason': 'badAnswer'}}
    return {'key': 'web', 'status': OK, 'values': {'ms': _milliseconds(started)}}


def check_jobs(now) -> dict:
    """A nightly command finished lately. Not set up until one has ever run, so a local machine is not a problem."""
    latest = JobLog.objects.filter(kind='command_finished', subject__in=NIGHTLY_COMMANDS).order_by('-created_at').first()
    if latest is None:
        return {'key': 'jobs', 'status': NOT_SET_UP, 'values': {}}
    hours = int((now - latest.created_at).total_seconds() // 3600)
    stale = now - latest.created_at > timedelta(hours=settings.SCHEDULE_STALE_HOURS)
    return {'key': 'jobs', 'status': PROBLEM if stale else OK, 'values': {'hours': hours}}


async def _read_the_first_line_of_the_stream(admin):
    """Open the live alert stream with a ticket, like a browser does, and read what it says first."""
    from asgiref.sync import sync_to_async
    from django.test import RequestFactory

    from alerts.sse_view import alert_stream
    from alerts.tickets import issue_ticket

    ticket = await sync_to_async(issue_ticket)(admin)
    response = await alert_stream(RequestFactory().get('/api/alerts/stream', {'ticket': ticket}))
    if response.status_code != 200:
        raise ValueError('the stream refused a ticket')
    lines = response.__aiter__()
    return await asyncio.wait_for(lines.__anext__(), STREAM_WAIT_SECONDS)


def _first_line_of_the_stream(admin):
    return async_to_sync(_read_the_first_line_of_the_stream)(admin)


def check_alert_stream() -> dict:
    from users.models import User
    admin = User.objects.filter(role='ADMIN', is_active=True).first()
    if admin is None:
        return {'key': 'alertStream', 'status': NOT_SET_UP, 'values': {}}
    started = time.perf_counter()
    try:
        _first_line_of_the_stream(admin)
    except Exception:
        return {'key': 'alertStream', 'status': PROBLEM, 'values': {'reason': 'noAnswer'}}
    return {'key': 'alertStream', 'status': OK, 'values': {'ms': _milliseconds(started)}}


def _safely(key: str, check) -> dict:
    """A check that breaks is a problem for its own service and never stops the others."""
    try:
        return check()
    except Exception:
        logger.exception('The %s health check broke', key)
        return {'key': key, 'status': PROBLEM, 'values': {'reason': 'error'}}


def run_checks() -> dict:
    now = timezone.now()
    checks = [
        _safely('web', check_web), _safely('database', check_database), _safely('aiService', check_ai_service),
        _safely('email', check_email), _safely('errorMonitoring', check_error_monitoring),
        _safely('imageStorage', check_image_storage), _safely('sensors', lambda: check_sensors(now)),
        _safely('jobs', lambda: check_jobs(now)), _safely('alertStream', check_alert_stream), _safely('website', check_website),
    ]
    return {
        'checked_at': now.isoformat(),
        'overall': PROBLEM if any(c['status'] == PROBLEM for c in checks) else OK,
        'checks': checks,
        'numbers': what_is_waiting(),
    }
