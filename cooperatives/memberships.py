"""Keeping a person's cooperative memberships in step with `users.cooperative`."""
from django.db import transaction
from django.utils import timezone

from .models import CooperativeMembership


def sync_membership(user, when=None) -> None:
    """Make the open membership say what `user.cooperative_id` says. Safe to call again: it changes nothing when they already agree.

    A person who moves has the first membership closed and the second opened at the same moment, so the history has no gap and no overlap.
    """
    when = when or timezone.now()
    with transaction.atomic():
        current = CooperativeMembership.objects.select_for_update().filter(user_id=user.pk, ended_at__isnull=True).first()
        if current is not None and current.cooperative_id == user.cooperative_id:
            return
        if current is not None:
            current.ended_at = max(when, current.started_at)
            current.save(update_fields=['ended_at'])
        if user.cooperative_id:
            CooperativeMembership.objects.create(user_id=user.pk, cooperative_id=user.cooperative_id, started_at=when)
