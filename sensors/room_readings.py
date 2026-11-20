"""Which readings belong to a batch.

A reading belongs to the room it was taken in. A batch has the readings of each room it stayed in, from the moment
the stay began up to, but not including, the moment it ended. A reading taken at the exact moment of a move belongs
to the new room. Readings made before rooms existed still know their batch, and they count for it too.
"""
from datetime import datetime
from datetime import timezone as dt_timezone

from django.db.models import (
    Count,
    DateTimeField,
    ExpressionWrapper,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, JSONObject

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


def _as_row():
    """A reading's three values as one JSON value, so one search finds all of them."""
    return JSONObject(temperature='temperature', humidity='humidity', timestamp='timestamp')


def newest_reading():
    """The newest reading of each batch of a list, as two annotations: `newest_in_stays` and `newest_before_rooms`.

    Each is one JSON value (temperature, humidity, timestamp), found once. The first is the newest reading of the rooms the batch stayed
    in, while it was there; the second is the newest of the old readings that know the batch and no room. Read the answer with
    `newest_of`, which takes the later of the two. Asking for the three values separately repeated the same search three or more times
    for every batch: 432 ms for 1,000 batches, against 182 for this.
    """
    window = _during_the_stay().order_by('-timestamp')
    stays = (
        BatchRoomStay.objects.filter(batch=OuterRef('pk'))
        .annotate(when=Subquery(window.values('timestamp')[:1]), row=Subquery(window.annotate(as_row=_as_row()).values('as_row')[:1]))
        .filter(when__isnull=False).order_by('-when')
    )
    before_rooms = SensorReading.objects.filter(batch=OuterRef('pk'), room__isnull=True).order_by('-timestamp')
    return {
        'newest_in_stays': Subquery(stays.values('row')[:1]),
        'newest_before_rooms': Subquery(before_rooms.annotate(as_row=_as_row()).values('as_row')[:1]),
    }


def newest_of(batch) -> dict | None:
    """The newest reading of a batch that was annotated with `newest_reading()`, or None when it has no reading at all."""
    found = [row for row in (batch.newest_in_stays, batch.newest_before_rooms) if row]
    if not found:
        return None
    rows = [{**row, 'timestamp': datetime.fromisoformat(row['timestamp'])} for row in found]
    return max(rows, key=lambda row: row['timestamp'])
