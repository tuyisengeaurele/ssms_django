"""Invitation links: making them, finding a usable one, and using it."""
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from .models import CooperativeInvitation

VALID_DAYS = 7
NO_LONGER_VALID = 'This invitation is no longer valid.'


class InvalidInvitation(Exception):
    """The link is unknown, expired, revoked or already used. The person is told the same thing for all four."""


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def link_for(token: str) -> str:
    return f'{settings.FRONTEND_URL}/join/{token}'


def issue(cooperative, inviter, email: str = '') -> tuple[CooperativeInvitation, str]:
    """Make an invitation. The token is returned once, and only its hash is kept."""
    token = secrets.token_urlsafe(32)
    invitation = CooperativeInvitation.objects.create(
        cooperative=cooperative,
        invited_by=inviter,
        token_hash=hash_token(token),
        email=(email or '').strip().lower(),
        expires_at=timezone.now() + timedelta(days=VALID_DAYS),
    )
    return invitation, token


def find_pending(token: str):
    """The invitation behind a token, or None when it cannot be used."""
    if not token:
        return None
    invitation = CooperativeInvitation.objects.select_related('cooperative', 'invited_by').filter(token_hash=hash_token(token)).first()
    if invitation is None or invitation.status != 'pending' or not invitation.cooperative.is_active:
        return None
    return invitation


def accept(invitation: CooperativeInvitation, user) -> None:
    """Put the person in the cooperative and use the invitation up. Two people cannot use one link."""
    with transaction.atomic():
        fresh = (
            CooperativeInvitation.objects.select_for_update()
            .filter(pk=invitation.pk, accepted_at__isnull=True, revoked_at__isnull=True, expires_at__gt=timezone.now())
            .first()
        )
        if fresh is None:
            raise InvalidInvitation(NO_LONGER_VALID)
        user.cooperative = fresh.cooperative
        user.save(update_fields=['cooperative'])
        fresh.accepted_by = user
        fresh.accepted_at = timezone.now()
        fresh.save(update_fields=['accepted_by', 'accepted_at'])


def send_invitation_email(invitation: CooperativeInvitation, token: str) -> None:
    inviter = invitation.invited_by.name if invitation.invited_by else 'A supervisor'
    message = '\n'.join([
        'Hello,',
        '',
        f'{inviter} has invited you to join {invitation.cooperative.name} on SSMS, the Smart Sericulture Management System.',
        '',
        f'Open this link to join (it works once and lasts {VALID_DAYS} days):',
        link_for(token),
        '',
        'If you were not expecting this, you can ignore this email.',
        '',
        'The SSMS Team',
    ])
    send_mail(
        subject=f'You are invited to join {invitation.cooperative.name} on SSMS',
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[invitation.email],
        fail_silently=False,
    )
