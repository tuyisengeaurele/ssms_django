"""Which alerts belong to a batch.

An alert about the air of a room, or a sensor that went quiet, belongs to the room. A batch has the alerts of each
room it stayed in, raised from the moment the stay began up to, but not including, the moment it ended. Alerts that
are about one batch (stage change, disease) and alerts made before rooms existed know their batch and count for it.
"""
from django.db.models import Count, Exists, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce

from batches.models import BatchRoomStay

from .models import AlertLog

PROBLEM_TYPES = ['TEMPERATURE', 'HUMIDITY']


def alerts_for_batch(batch, qs=None):
    """The alerts of one batch, as a queryset, so a caller can order, slice and aggregate it."""
    condition = Q(batch=batch)
    for stay in BatchRoomStay.objects.filter(batch=batch):
        in_stay = Q(batch__isnull=True, room_id=stay.room_id, created_at__gte=stay.started_at)
        if stay.ended_at is not None:
            in_stay &= Q(created_at__lt=stay.ended_at)
        condition |= in_stay
    return (AlertLog.objects.all() if qs is None else qs).filter(condition)


def belongs_to_batch(batch_pk):
    """The same rule as a filter for a subquery that is run once for every batch of a list.

    Pass the batch's key as the subquery sees it, for example OuterRef('pk').
    """
    during_a_stay = BatchRoomStay.objects.filter(
        batch=OuterRef(batch_pk),
        room=OuterRef('room'),
        started_at__lte=OuterRef('created_at'),
    ).filter(Q(ended_at__isnull=True) | Q(ended_at__gt=OuterRef('created_at')))
    return Q(batch=batch_pk) | (Q(batch__isnull=True) & Q(Exists(during_a_stay)))


def _count(qs):
    rows = qs.order_by().annotate(one=Value(1)).values('one').annotate(n=Count('pk')).values('n')
    return Coalesce(Subquery(rows, output_field=IntegerField()), 0)


def alert_count():
    """How many alerts each batch of a list has, worked out in the one query."""
    return _count(AlertLog.objects.filter(belongs_to_batch(OuterRef('pk'))))


def open_problem_count():
    """The air problems open right now for each batch of a list: its own, and those of the room it is in."""
    return _count(
        AlertLog.objects.filter(type__in=PROBLEM_TYPES, resolved_at__isnull=True)
        .filter(Q(batch=OuterRef('pk')) | Q(batch__isnull=True, room=OuterRef('room')))
    )
