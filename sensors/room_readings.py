"""Which readings belong to a batch.

A reading belongs to the room it was taken in. A batch has the readings of each room it stayed in, from the moment
the stay began up to, but not including, the moment it ended. A reading taken at the exact moment of a move belongs
to the new room. Readings made before rooms existed still know their batch, and they count for it too.
"""
from django.db.models import Exists, OuterRef, Q

from batches.models import BatchRoomStay

from .models import SensorReading


def readings_for_batch(batch, qs=None):
    """The readings of one batch, as a queryset, so a caller can order, slice and aggregate it."""
    condition = Q(batch=batch, room__isnull=True)
    for stay in BatchRoomStay.objects.filter(batch=batch):
        in_stay = Q(room_id=stay.room_id, timestamp__gte=stay.started_at)
        if stay.ended_at is not None:
            in_stay &= Q(timestamp__lt=stay.ended_at)
        condition |= in_stay
    return (SensorReading.objects.all() if qs is None else qs).filter(condition)


def belongs_to_batch(batch_pk):
    """The same rule as a filter for a subquery that is run once for every batch of a list.

    Pass the batch's key as the subquery sees it, for example OuterRef('pk').
    """
    during_a_stay = BatchRoomStay.objects.filter(
        batch=OuterRef(batch_pk),
        room=OuterRef('room'),
        started_at__lte=OuterRef('timestamp'),
    ).filter(Q(ended_at__isnull=True) | Q(ended_at__gt=OuterRef('timestamp')))
    return Q(Exists(during_a_stay)) | Q(batch=batch_pk, room__isnull=True)
