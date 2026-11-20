"""Which readings belong to a batch.

A reading belongs to the room it was taken in. A batch has the readings of each room it stayed in, from the moment
the stay began up to, but not including, the moment it ended. A reading taken at the exact moment of a move belongs
to the new room. Readings made before rooms existed still know their batch, and they count for it too.
"""
from datetime import datetime
from datetime import timezone as dt_timezone

from django.db.models import (
    Case,
    Count,
    DateTimeField,
    ExpressionWrapper,
    FloatField,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, Greatest
from django.db.models.lookups import GreaterThan

from batches.models import BatchRoomStay

from .models import SensorReading


def readings_for_batch(batch, qs=None, stays=None):
    """The readings of one batch, as a queryset, so a caller can order, slice and aggregate it.

    A caller that already has the batch's stays (a page that also lists them) passes them in, so they are read once.
    """
    condition = Q(batch=batch, room__isnull=True)
    for stay in BatchRoomStay.objects.filter(batch=batch) if stays is None else stays:
        in_stay = Q(room_id=stay.room_id, timestamp__gte=stay.started_at)
        if stay.ended_at is not None:
            in_stay &= Q(timestamp__lt=stay.ended_at)
        condition |= in_stay
    return (SensorReading.objects.all() if qs is None else qs).filter(condition)


# ── The same rule for a whole list of batches, in the database ──────────────────────────────────────────────────────────────
#
# `readings_for_batch` above is the rule for one batch. Written as a filter for every batch of a list it became a test run against
# every reading, which no index can help: with 288,000 readings one batch's count took 2.4 seconds, and a list of five batches 14. The
# functions below say it the other way round. A batch has stays, a stay has a room and two dates, and the readings of that room
# between those dates are what the room and time index finds: 22 ms for the
# same count. They must agree with `readings_for_batch` (tests/test_reading_queries.py holds them to it). The one assumption is the
# one the rest of the app keeps: the stays of a batch do not overlap, since moving a batch closes the stay it was in.

FAR_FUTURE = datetime(9999, 12, 31, tzinfo=dt_timezone.utc)
LONG_AGO = datetime(1970, 1, 1, tzinfo=dt_timezone.utc)


def _during_the_stay():
    """The readings taken in the room of the stay being looked at, from the day it began up to, not including, the day it ended."""
    return SensorReading.objects.filter(
        room=OuterRef('room'),
        timestamp__gte=OuterRef('started_at'),
        timestamp__lt=Coalesce(OuterRef('ended_at'), Value(FAR_FUTURE, output_field=DateTimeField())),
    )


def reading_count():
    """How many readings each batch of a list has: those of its stays, and the old ones that know the batch and no room."""
    per_stay = _during_the_stay().order_by().values('room').annotate(n=Count('pk')).values('n')
    in_stays = (
        BatchRoomStay.objects.filter(batch=OuterRef('pk'))
        .annotate(n=Coalesce(Subquery(per_stay, output_field=IntegerField()), 0))
        .order_by().values('batch').annotate(total=Sum('n')).values('total')
    )
    before_rooms = SensorReading.objects.filter(batch=OuterRef('pk'), room__isnull=True).order_by().values('batch').annotate(n=Count('pk')).values('n')
    return ExpressionWrapper(
        Coalesce(Subquery(in_stays, output_field=IntegerField()), 0) + Coalesce(Subquery(before_rooms, output_field=IntegerField()), 0),
        output_field=IntegerField(),
    )


def _newest_in_stays(field):
    """The date and the `field` of the newest reading of each stay, and of the stay that has the newest of all."""
    window = _during_the_stay().order_by('-timestamp')
    stays = (
        BatchRoomStay.objects.filter(batch=OuterRef('pk'))
        .annotate(when=Subquery(window.values('timestamp')[:1]), value=Subquery(window.values(field)[:1]))
        .filter(when__isnull=False).order_by('-when')
    )
    return Subquery(stays.values('when')[:1]), Subquery(stays.values('value')[:1])


def newest_reading():
    """The newest reading of each batch of a list, as annotations: latest_temperature, latest_humidity and latest_reading_at."""
    before_rooms = SensorReading.objects.filter(batch=OuterRef('pk'), room__isnull=True).order_by('-timestamp')
    old_when = Subquery(before_rooms.values('timestamp')[:1])
    long_ago = Value(LONG_AGO, output_field=DateTimeField())
    notes = {}
    for name, field in (('latest_temperature', 'temperature'), ('latest_humidity', 'humidity')):
        stay_when, stay_value = _newest_in_stays(field)
        notes[name] = Case(
            When(GreaterThan(Coalesce(old_when, long_ago), Coalesce(stay_when, long_ago)), then=Subquery(before_rooms.values(field)[:1])),
            default=stay_value, output_field=FloatField(),
        )
    stay_when, _ = _newest_in_stays('temperature')
    notes['latest_reading_at'] = Greatest(stay_when, old_when)   # PostgreSQL's GREATEST leaves out what is missing
    return notes
