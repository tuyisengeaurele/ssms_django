"""Which alerts belong to a batch.

An alert about the air of a room, or a sensor that went quiet, belongs to the room. A batch has the alerts of each
room it stayed in, raised from the moment the stay began up to, but not including, the moment it ended. Alerts that
are about one batch (stage change, disease) and alerts made before rooms existed know their batch and count for it.
"""
from django.db.models import Count, DateTimeField, ExpressionWrapper, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from batches.models import BatchRoomStay
from sensors.room_readings import FAR_FUTURE

from .models import AlertLog

PROBLEM_TYPES = ['TEMPERATURE', 'HUMIDITY']


def alerts_for_batch(batch, qs=None, stays=None):
    """The alerts of one batch, as a queryset, so a caller can order, slice and aggregate it.

    A caller that already has the batch's stays (a page that also lists them) passes them in, so they are read once.
    """
    condition = Q(batch=batch)
    for stay in BatchRoomStay.objects.filter(batch=batch) if stays is None else stays:
        in_stay = Q(batch__isnull=True, room_id=stay.room_id, created_at__gte=stay.started_at)
        if stay.ended_at is not None:
            in_stay &= Q(created_at__lt=stay.ended_at)
        condition |= in_stay
    return (AlertLog.objects.all() if qs is None else qs).filter(condition)


def _count(qs):
    rows = qs.order_by().annotate(one=Value(1)).values('one').annotate(n=Count('pk')).values('n')
    return Coalesce(Subquery(rows, output_field=IntegerField()), 0)


def alert_count(types=None):
    """How many alerts each batch of a list has, worked out in the one query. Only those of `types`, when given.

    The alerts of the batch itself, and those of each room it stayed in, raised during the stay. It goes from the batch's stays to the
    alerts of that room, as sensors.room_readings.reading_count does for readings, so a batch costs its own stays and not a pass over
    every alert (alerts_for_batch above is the rule, and tests/test_reading_queries.py holds this to it).
    """
    base = AlertLog.objects.all() if not types else AlertLog.objects.filter(type__in=types)
    per_stay = (
        base.filter(
            batch__isnull=True, room=OuterRef('room'), created_at__gte=OuterRef('started_at'),
            created_at__lt=Coalesce(OuterRef('ended_at'), Value(FAR_FUTURE, output_field=DateTimeField())),
        )
        .order_by().values('room').annotate(n=Count('pk')).values('n')
    )
    in_stays = (
        BatchRoomStay.objects.filter(batch=OuterRef('pk'))
        .annotate(n=Coalesce(Subquery(per_stay, output_field=IntegerField()), 0))
        .order_by().values('batch').annotate(total=Sum('n')).values('total')
    )
    its_own = base.filter(batch=OuterRef('pk')).order_by().values('batch').annotate(n=Count('pk')).values('n')
    return ExpressionWrapper(
        Coalesce(Subquery(in_stays, output_field=IntegerField()), 0) + Coalesce(Subquery(its_own, output_field=IntegerField()), 0),
        output_field=IntegerField(),
    )


def open_problem_count():
    """The air problems open right now for each batch of a list: its own, and those of the room it is in."""
    return _count(
        AlertLog.objects.filter(type__in=PROBLEM_TYPES, resolved_at__isnull=True)
        .filter(Q(batch=OuterRef('pk')) | Q(batch__isnull=True, room=OuterRef('room')))
    )
