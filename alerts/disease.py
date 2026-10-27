"""The alert raised when a disease check finds a disease.

A disease alert is about one batch and one photo, so every positive check raises its own. The email is held back to
one an hour per batch, and it goes to the farm owner only when someone else made the check: the person who made it is
looking at the result.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from core.mail import Email

from . import utils
from .models import AlertLog

logger = logging.getLogger(__name__)

# The results of the check that are diseases. "Healthy" and anything the page does not know are not.
DISEASES = ['Flacherie', 'Grasserie', 'Muscardine', 'Pebrine']
EMAIL_THROTTLE_MINUTES = 60


def is_positive(result: str, confidence: float) -> bool:
    """A disease, and one the check is at least as sure of as the limit. Below it the result is shown but nobody is alarmed."""
    return result in DISEASES and confidence >= settings.DISEASE_ALERT_MIN_CONFIDENCE


def raise_disease_alert(batch, result: str, confidence: float, checked_by) -> AlertLog | None:
    """Make the alert for a positive check, and email the owner if someone else made it. None when the check is not positive."""
    if not is_positive(result, confidence):
        return None

    recent = AlertLog.objects.filter(
        batch_id=batch.pk, type='DISEASE', created_at__gte=timezone.now() - timedelta(minutes=EMAIL_THROTTLE_MINUTES),
    ).exists()
    message = (
        f'{result} suspected in this batch ({round(confidence * 100)}% confidence). '
        'Check the batch and ask your supervisor to take a look.'
    )
    alert = AlertLog.objects.create(batch=batch, type='DISEASE', message=message)

    owner = batch.farm.owner
    if not recent and owner.pk != checked_by.pk:
        _email_owner(batch, owner, checked_by, alert)
    return alert


def _email_owner(batch, owner, checked_by, alert: AlertLog) -> None:
    try:
        if not owner.email:
            return
        farm = batch.farm
        content = Email(
            heading=f'Disease suspected on {farm.name}',
            greeting=f'Dear {owner.name or "Farmer"},',
            intro=(f'A disease check on batch {utils.short_id(batch.pk)} at {farm.name} found something.',),
            facts=(('Details', alert.message), ('Checked by', checked_by.name or checked_by.email)),
            button=('Open the batch', f'{settings.FRONTEND_URL}/batches/{batch.pk}'),
            closing=(
                'The check is a quick second opinion and can be wrong. Please look at the batch, and ask your supervisor or '
                'a sericulture officer before using any disinfectant or medicine.',
            ),
            reason=f'You received this because you own {farm.name} on SSMS.',
        )
        utils._send_mail_async(f'[SSMS Alert] Disease suspected on {farm.name}', [owner.email], content)
    except Exception:
        logger.exception('Could not send the disease alert email')
