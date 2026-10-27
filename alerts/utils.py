"""
Alert rule engine, called after every sensor reading (API, device or simulator).

A room is one environment, so a room is what gets judged, once, however many batches are in it. Its safe range is
worked out from the batches that are running in it (see room_range). Out of range makes one open alert per room and
kind, so a problem that lasts does not fill the list. The first reading back in range resolves the open alert, and a
later problem opens a new one. A room with no running batch is not judged, and its open alerts are resolved.

Email throttle: only one email per (room, alert_type) per 60 minutes, so a room that keeps flipping in and out
of range does not flood the farmer.

Emails are sent in a background daemon thread so SMTP latency never blocks the sensor-reading API response.
"""

import threading
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from .models import AlertLog, StageThreshold

# The stages in the order a batch lives them, so the youngest one can be told apart.
STAGE_ORDER = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST']


@dataclass(frozen=True)
class SafeRange:
    temp_min: float = 22.0
    temp_max: float = 28.0
    hum_min: float = 70.0
    hum_max: float = 85.0


# What a stage uses when it has no row of its own.
DEFAULT_RANGE = SafeRange()


def safe_range_for(stage: str | None) -> SafeRange:
    """The range of one stage, for a caller that works on a single stage. A room uses room_range."""
    return room_range([stage]) if stage else DEFAULT_RANGE


def running_batches(room_id: str):
    """The batches that decide the range of a room: live ones that have not reached harvest."""
    from batches.models import Batch

    return Batch.objects.filter(room_id=room_id, is_active=True).exclude(stage='HARVEST')


def room_range(stages: list[str]) -> SafeRange:
    """The one range a room is judged by.

    Where the ranges of all the stages in the room overlap, that overlap: the highest minimum and the lowest maximum.
    When they overlap on nothing, the range of the youngest stage in the room.
    """
    rows = {t.stage: t for t in StageThreshold.objects.filter(stage__in=stages)}
    ranges = {
        stage: (
            SafeRange(rows[stage].temp_min, rows[stage].temp_max, rows[stage].hum_min, rows[stage].hum_max)
            if stage in rows else DEFAULT_RANGE
        )
        for stage in set(stages)
    }
    shared = SafeRange(
        temp_min=max(r.temp_min for r in ranges.values()), temp_max=min(r.temp_max for r in ranges.values()),
        hum_min=max(r.hum_min for r in ranges.values()), hum_max=min(r.hum_max for r in ranges.values()),
    )
    if shared.temp_min <= shared.temp_max and shared.hum_min <= shared.hum_max:
        return shared
    youngest = min(ranges, key=lambda stage: STAGE_ORDER.index(stage) if stage in STAGE_ORDER else len(STAGE_ORDER))
    return ranges[youngest]


EMAIL_THROTTLE_MINUTES = 60   # one alert email per room+type per hour


def _send_mail_async(*args, **kwargs):
    """Fire-and-forget: run send_mail in a daemon thread so SMTP never blocks the request."""
    t = threading.Thread(target=send_mail, args=args, kwargs=kwargs, daemon=True)
    t.start()


def _should_send_email(room_id: str, alert_type: str) -> bool:
    """
    Return True only if no alert of this type was raised for this room
    in the last EMAIL_THROTTLE_MINUTES.  We infer "was sent" from whether
    an AlertLog entry already exists in that window (the email is sent on
    creation, so existence of a recent record = email already sent).
    """
    cutoff = timezone.now() - timedelta(minutes=EMAIL_THROTTLE_MINUTES)
    return not AlertLog.objects.filter(room_id=room_id, type=alert_type, created_at__gte=cutoff).exists()


def short_id(batch_id: str) -> str:
    """How a batch is named on screen: # and the last eight characters of its id."""
    return f'#{batch_id[-8:].upper()}'


def _send_farmer_alert(room, batches, alert: AlertLog, safe: SafeRange) -> None:
    """
    Send an alert email to the farm owner (farmer) for the given alert.
    Silently skips if the room has no associated farm / owner / email.
    Email is dispatched asynchronously, never blocks the caller.
    """
    try:
        farm = room.farm
        owner = getattr(farm, 'owner', None)
        email = getattr(owner, 'email', None) if owner else None
        if not email:
            return

        type_label = alert.type.replace('_', ' ').title()
        subject = f'[SSMS Alert] {type_label} warning for {room.name}, {farm.name}'
        body = (
            f'Dear {owner.name or "Farmer"},\n\n'
            f'An environmental alert has been raised for {room.name} on {farm.name}.\n\n'
            f'Alert type : {type_label}\n'
            f'Details    : {alert.message}\n'
            f'Batches    : {", ".join(short_id(b.pk) for b in batches) or "none"}\n'
            f'Time (UTC) : {alert.created_at.strftime("%Y-%m-%d %H:%M") if alert.created_at else "now"}\n\n'
            f'Please check your silkworm rearing conditions as soon as possible to ensure '
            f'the health of your silkworms.\n\n'
            f'Safe range for this room:\n'
            f'  - Temperature : {safe.temp_min} °C to {safe.temp_max} °C\n'
            f'  - Humidity    : {safe.hum_min} % to {safe.hum_max} %\n\n'
            f'Log in to SSMS to view all alerts and sensor readings:\n'
            f'{settings.FRONTEND_URL}/alerts\n\n'
            f'Best regards,\nThe SSMS team\nSmart Sericulture Management System, Rwanda'
        )

        _send_mail_async(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=True,
        )
    except Exception:
        pass   # never let email failure break the main flow


def temperature_problem(value: float, safe: SafeRange) -> str | None:
    if value < safe.temp_min:
        return f'Temperature too low: {value} °C (safe min is {safe.temp_min} °C). Check heating.'
    if value > safe.temp_max:
        return f'Temperature too high: {value} °C (safe max is {safe.temp_max} °C). Improve ventilation.'
    return None


def humidity_problem(value: float, safe: SafeRange) -> str | None:
    if value < safe.hum_min:
        return f'Humidity too low: {value}% (safe min is {safe.hum_min}%). Add moisture.'
    if value > safe.hum_max:
        return f'Humidity too high: {value}% (safe max is {safe.hum_max}%). Improve air circulation.'
    return None


def settle_room_alerts(room_id: str) -> None:
    """Resolve what a room with nothing running in it can no longer have: its air problems and its sensor outages.
    Call it after a batch leaves the room, is deleted or reaches harvest."""
    if running_batches(room_id).exists():
        return
    AlertLog.objects.filter(
        room_id=room_id, type__in=['TEMPERATURE', 'HUMIDITY', 'SYSTEM'], resolved_at__isnull=True,
    ).update(resolved_at=timezone.now())


def check_room_alerts(room_id: str, temperature: float, humidity: float) -> list:
    """
    Judge one reading against the range of the room. Returns the alerts this reading opened.
    A problem that already has an open alert opens nothing new, and a reading back in range resolves it.
    """
    from farms.models import RearingRoom

    with transaction.atomic():
        # The row lock makes two readings that arrive together agree on which alerts are open.
        room = (
            RearingRoom.objects.select_for_update(of=('self',)).select_related('farm__owner')
            .filter(pk=room_id, is_active=True).first()
        )
        if room is None:
            return []

        batches = list(running_batches(room_id).order_by('created_at'))
        if not batches:
            settle_room_alerts(room_id)
            return []

        safe = room_range([b.stage for b in batches])
        now = timezone.now()
        to_create = []
        for type_, message in (
            ('TEMPERATURE', temperature_problem(temperature, safe)),
            ('HUMIDITY', humidity_problem(humidity, safe)),
        ):
            open_alerts = AlertLog.objects.filter(room_id=room_id, type=type_, resolved_at__isnull=True)
            if message is None:
                open_alerts.update(resolved_at=now)
            elif not open_alerts.exists():
                to_create.append(AlertLog(room_id=room_id, type=type_, message=message))

        if not to_create:
            return []

        # Decide which types need an email BEFORE inserting, so the throttle looks at earlier records only.
        send_for_types = {a.type for a in to_create if _should_send_email(room_id, a.type)}
        # One at a time on purpose: older databases have a native enum on alert_logs.type, and Django's bulk
        # insert cannot write into one. There are only ever a couple of alerts here.
        for alert in to_create:
            alert.save()

    for alert in to_create:
        if alert.type in send_for_types:
            _send_farmer_alert(room, batches, alert, safe)
    return to_create
