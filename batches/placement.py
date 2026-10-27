"""Putting a batch in a room, and taking it out. Each change keeps where the batch has been."""
from django.db import transaction
from django.utils import timezone

from .models import BatchRoomStay


def _settle(room_id) -> None:
    """A room the batch left may have nothing running in it now, and then its alerts end."""
    if room_id:
        from alerts.utils import settle_room_alerts

        settle_room_alerts(room_id)


def place_batch(batch, room, when=None) -> None:
    """Close the stay the batch has now and open one in `room`, in one step."""
    when = when or timezone.now()
    left = batch.room_id
    with transaction.atomic():
        BatchRoomStay.objects.filter(batch=batch, ended_at__isnull=True).update(ended_at=when)
        BatchRoomStay.objects.create(batch=batch, room=room, started_at=when)
        batch.room = room
        batch.save(update_fields=['room'])
    if left != room.pk:
        _settle(left)


def leave_room(batch, when=None) -> None:
    """The batch is in no room any more, for example because it was deleted."""
    when = when or timezone.now()
    left = batch.room_id
    with transaction.atomic():
        BatchRoomStay.objects.filter(batch=batch, ended_at__isnull=True).update(ended_at=when)
        batch.room = None
        batch.save(update_fields=['room'])
    _settle(left)
