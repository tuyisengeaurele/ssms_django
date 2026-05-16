"""
Alert rule engine — called after every sensor reading (API or simulator).

Safe ranges for silkworm farming:
  Temperature : 22.0 – 28.0 °C
  Humidity    : 70.0 – 85.0 %

Email throttle: only one email per (batch, alert_type) per 60 minutes so
farmers are not flooded during extended out-of-range periods.

Emails are sent in a background daemon thread so SMTP latency never blocks
the sensor-reading API response.
"""

import threading
from datetime import timedelta
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import AlertLog

TEMP_MIN = 22.0
TEMP_MAX = 28.0
HUM_MIN  = 70.0
HUM_MAX  = 85.0

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


def _send_farmer_alert(batch, alert: AlertLog) -> None:
    """
    Send an alert email to the farm owner (farmer) for the given alert.
    Silently skips if the batch has no associated farm / owner / email.
    Email is dispatched asynchronously — never blocks the caller.
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
        subject    = f'[SSMS Alert] {type_label} Warning — {farm_name}'
        body       = (
            f'Dear {name},\n\n'
            f'An environmental alert has been triggered for one of your batches on {farm_name}.\n\n'
            f'Alert type : {type_label}\n'
            f'Details    : {alert.message}\n'
            f'Time (UTC) : {alert.created_at.strftime("%Y-%m-%d %H:%M") if alert.created_at else "now"}\n\n'
            f'Please check your silkworm rearing conditions as soon as possible to ensure '
            f'the health of your silkworms.\n\n'
            f'Safe ranges:\n'
            f'  • Temperature : {TEMP_MIN} °C – {TEMP_MAX} °C\n'
            f'  • Humidity    : {HUM_MIN} % – {HUM_MAX} %\n\n'
            f'Log in to SSMS to view all alerts and sensor readings:\n'
            f'{settings.FRONTEND_URL}/alerts\n\n'
            f'Best regards,\nSSMS — Silkworm Smart Management System, Rwanda'
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


def check_sensor_alerts(batch_id: str, temperature: float, humidity: float) -> list:
    """
    Inspect a single sensor reading. If either value is out of safe range,
    create and persist AlertLog records. Returns the list of created alerts.
    """
    to_create = []

    if temperature < TEMP_MIN:
        to_create.append(AlertLog(
            batch_id=batch_id,
            type='TEMPERATURE',
            message=(
                f'Temperature too low: {temperature} °C '
                f'(safe min is {TEMP_MIN} °C). Check heating.'
            ),
        ))
    elif temperature > TEMP_MAX:
        to_create.append(AlertLog(
            batch_id=batch_id,
            type='TEMPERATURE',
            message=(
                f'Temperature too high: {temperature} °C '
                f'(safe max is {TEMP_MAX} °C). Improve ventilation.'
            ),
        ))

    if humidity < HUM_MIN:
        to_create.append(AlertLog(
            batch_id=batch_id,
            type='HUMIDITY',
            message=(
                f'Humidity too low: {humidity}% '
                f'(safe min is {HUM_MIN}%). Add moisture.'
            ),
        ))
    elif humidity > HUM_MAX:
        to_create.append(AlertLog(
            batch_id=batch_id,
            type='HUMIDITY',
            message=(
                f'Humidity too high: {humidity}% '
                f'(safe max is {HUM_MAX}%). Improve air circulation.'
            ),
        ))

    if not to_create:
        return []

    # Determine which types need an email BEFORE inserting (so the throttle
    # check looks at pre-existing records, not the ones we're about to add).
    send_for_types = {
        a.type for a in to_create if _should_send_email(batch_id, a.type)
    }

    AlertLog.objects.bulk_create(to_create)

    # Refresh from DB so created_at is populated, then email asynchronously
    if send_for_types:
        from batches.models import Batch
        try:
            batch = Batch.objects.select_related('farm__owner').get(pk=batch_id)
        except Batch.DoesNotExist:
            batch = None

        if batch:
            for alert in to_create:
                if alert.type in send_for_types:
                    _send_farmer_alert(batch, alert)

    return to_create
