"""
Alert rule engine, called after every sensor reading (API, device or simulator).

Each stage of a batch has a safe range (the StageThreshold table, which an admin can edit). Out of range makes
one open alert per problem and kind, so a problem that lasts does not fill the list. The first reading back in
range resolves the open alert, and a later problem opens a new one.

Email throttle: only one email per (batch, alert_type) per 60 minutes, so a batch that keeps flipping in and out
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


@dataclass(frozen=True)
class SafeRange:
    temp_min: float = 22.0
    temp_max: float = 28.0
    hum_min: float = 70.0
    hum_max: float = 85.0


# What a stage uses when it has no row of its own.
DEFAULT_RANGE = SafeRange()
TEMP_MIN, TEMP_MAX = DEFAULT_RANGE.temp_min, DEFAULT_RANGE.temp_max
HUM_MIN, HUM_MAX = DEFAULT_RANGE.hum_min, DEFAULT_RANGE.hum_max


def safe_range_for(stage: str | None) -> SafeRange:
    row = StageThreshold.objects.filter(stage=stage).first() if stage else None
    if row is None:
        return DEFAULT_RANGE
    return SafeRange(row.temp_min, row.temp_max, row.hum_min, row.hum_max)


EMAIL_THROTTLE_MINUTES = 60   # one alert email per batch+type per hour


def _send_mail_async(*args, **kwargs):
    """Fire-and-forget: run send_mail in a daemon thread so SMTP never blocks the request."""
    t = threading.Thread(target=send_mail, args=args, kwargs=kwargs, daemon=True)
    t.start()


def _should_send_email(batch_id: str, alert_type: str) -> bool:
    """
    Return True only if no alert of this type was sent for this batch
    in the last EMAIL_THROTTLE_MINUTES.  We infer "was sent" from whether
    an AlertLog entry already exists in that window (the email is sent on
    creation, so existence of a recent record = email already sent).
    """
    cutoff = timezone.now() - timedelta(minutes=EMAIL_THROTTLE_MINUTES)
    return not AlertLog.objects.filter(
        batch_id=batch_id,
        type=alert_type,
        created_at__gte=cutoff,
    ).exists()


def _send_farmer_alert(batch, alert: AlertLog, safe: SafeRange = DEFAULT_RANGE) -> None:
    """
    Send an alert email to the farm owner (farmer) for the given alert.
    Silently skips if the batch has no associated farm / owner / email.
    Email is dispatched asynchronously, never blocks the caller.
    """
    try:
        farm  = getattr(batch, 'farm', None)
        owner = getattr(farm,  'owner', None) if farm else None
        email = getattr(owner, 'email', None) if owner else None
        if not email:
            return

        farm_name = farm.name if farm else 'your farm'
        name      = owner.name if owner else 'Farmer'

        type_label = alert.type.replace('_', ' ').title()
        subject    = f'[SSMS Alert] {type_label} Warning for {farm_name}'
        body       = (
            f'Dear {name},\n\n'
            f'An environmental alert has been triggered for one of your batches on {farm_name}.\n\n'
            f'Alert type : {type_label}\n'
            f'Details    : {alert.message}\n'
            f'Time (UTC) : {alert.created_at.strftime("%Y-%m-%d %H:%M") if alert.created_at else "now"}\n\n'
            f'Please check your silkworm rearing conditions as soon as possible to ensure '
            f'the health of your silkworms.\n\n'
            f'Safe ranges:\n'
            f'  • Temperature : {TEMP_MIN} °C to {TEMP_MAX} °C\n'
            f'  • Humidity    : {HUM_MIN} % to {HUM_MAX} %\n\n'
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


def check_sensor_alerts(batch_id: str, temperature: float, humidity: float) -> list:
    """
    Judge one reading against the safe range of the batch's stage. Returns the alerts this reading opened.
    A problem that already has an open alert opens nothing new, and a reading back in range resolves it.
    """
    from batches.models import Batch

    with transaction.atomic():
        # The row lock makes two readings that arrive together agree on which alerts are open.
        batch = Batch.objects.select_for_update().select_related('farm__owner').filter(pk=batch_id).first()
        if batch is None:
            return []

        safe = safe_range_for(batch.stage)
        now = timezone.now()
        to_create = []
        for type_, message in (
            ('TEMPERATURE', temperature_problem(temperature, safe)),
            ('HUMIDITY', humidity_problem(humidity, safe)),
        ):
            open_alerts = AlertLog.objects.filter(batch_id=batch_id, type=type_, resolved_at__isnull=True)
            if message is None:
                open_alerts.update(resolved_at=now)
            elif not open_alerts.exists():
                to_create.append(AlertLog(batch_id=batch_id, type=type_, message=message))

        if not to_create:
            return []

        # Decide which types need an email BEFORE inserting, so the throttle looks at earlier records only.
        send_for_types = {a.type for a in to_create if _should_send_email(batch_id, a.type)}
        # One at a time on purpose: older databases have a native enum on alert_logs.type, and Django's bulk
        # insert cannot write into one. There are only ever a couple of alerts here.
        for alert in to_create:
            alert.save()

    for alert in to_create:
        if alert.type in send_for_types:
            _send_farmer_alert(batch, alert, safe)
    return to_create
