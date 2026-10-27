from django.db.models import Count, IntegerField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce


def _count_of(model):
    rows = (
        model.objects.filter(batch=OuterRef('pk'))
        .order_by().values('batch').annotate(n=Count('pk')).values('n')
    )
    return Coalesce(Subquery(rows, output_field=IntegerField()), 0)


def _reading_count():
    """The readings of each batch are those of the rooms it stayed in, so they are counted by its stays."""
    from sensors.models import SensorReading
    from sensors.room_readings import belongs_to_batch

    rows = (
        SensorReading.objects.filter(belongs_to_batch(OuterRef('pk')))
        .order_by().annotate(one=Value(1)).values('one').annotate(n=Count('pk')).values('n')
    )
    return Coalesce(Subquery(rows, output_field=IntegerField()), 0)


def with_counts(qs):
    """Add detection, reading and alert totals to a Batch queryset in a single query.

    Separate subqueries are used on purpose. Joining all three tables at once multiplies the rows
    (653 readings times 109 alerts), which is slow and gives wrong totals without distinct.
    """
    from alerts.models import AlertLog
    from sensors.models import DiseaseDetection

    return qs.select_related('room').annotate(
        detection_total=_count_of(DiseaseDetection),
        reading_total=_reading_count(),
        alert_total=_count_of(AlertLog),
    )
