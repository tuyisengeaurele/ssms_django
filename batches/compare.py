"""Two to four batches side by side: what each one started with, what it gave, and how its air and health were.

The numbers are the ones the batch page and the harvest page already show, gathered so a person can see which batch did
better and why. Nothing here is stored. See BatchCompareView for who may compare which batches.
"""
from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import NotFound

from alerts.models import StageThreshold
from alerts.room_alerts import alert_count
from alerts.utils import DEFAULT_RANGE, SafeRange
from core.access import scope_batches
from core.timeutil import aware
from harvest.models import HarvestRecord, QualityGrade
from sensors.models import DiseaseDetection
from sensors.rollups import rollups_for_batch, split_point
from sensors.room_readings import readings_for_batch

from .models import Batch, BatchRoomStay, MortalityRecord
from .queries import with_counts

MOST = 4
# The alerts that say something went wrong. A stage change or a system notice is not a problem.
PROBLEM_ALERTS = ['TEMPERATURE', 'HUMIDITY', 'DISEASE']
NEEDS_TWO = 'Choose at least two batches to compare.'
TOO_MANY = f'You can compare up to {MOST} batches at a time.'
NOT_FOUND = "We couldn't find that batch."


class BadChoice(ValueError):
    """The ids asked for cannot be compared. The message is shown to the person as it is."""


def parse_ids(raw: str) -> list[str]:
    """The ids in the order they were given, each once, with spaces and empty entries dropped."""
    ids: list[str] = []
    for part in (raw or '').split(','):
        part = part.strip()
        if part and part not in ids:
            ids.append(part)
    if len(ids) < 2:
        raise BadChoice(NEEDS_TWO)
    if len(ids) > MOST:
        raise BadChoice(TOO_MANY)
    return ids


def _kg(value) -> float:
    return float(round(Decimal(value or 0), 2))


def _yield_per_unit(batch, kg: float):
    """Kilograms of cocoons per egg box, or per thousand worms when the batch was counted in worms."""
    if not batch.quantity or not kg:
        return None
    if batch.quantity_unit == 'WORMS':
        return {'unit': 'WORMS', 'kg': round(kg / batch.quantity * 1000, 2)}
    return {'unit': 'BOXES', 'kg': round(kg / batch.quantity, 2)}


def _safe_ranges() -> dict:
    """The safe range of every stage, read once. A stage with no row of its own uses the usual range."""
    return {
        row.stage: SafeRange(row.temp_min, row.temp_max, row.hum_min, row.hum_max)
        for row in StageThreshold.objects.all()
    }


def _conditions(batch, ranges: dict, split):
    """How much of what the batch's room measured was inside the safe range of its stage, or None with no readings.

    Readings older than the keeping time have been summarised by the hour and removed, so they are counted from the summaries: an hour
    counts as inside when its average was inside, which is close but not the reading-by-reading figure the newer readings give.
    """
    safe = ranges.get(batch.stage, DEFAULT_RANGE)
    stays = list(BatchRoomStay.objects.filter(batch=batch))     # read once, for the raw readings and the summaries
    inside = Q(temperature__gte=safe.temp_min, temperature__lte=safe.temp_max, humidity__gte=safe.hum_min, humidity__lte=safe.hum_max)
    raw = readings_for_batch(batch, stays=stays)
    if split is not None:
        raw = raw.filter(Q(room__isnull=True) | Q(timestamp__gte=split))
    totals = raw.aggregate(total=Count('pk'), inside=Count('pk', filter=inside))
    total, inside_count = totals['total'], totals['inside']
    if split is not None:
        summarised = rollups_for_batch(batch, stays).filter(hour__lt=split).aggregate(
            total=Sum('count'),
            inside=Sum('count', filter=Q(
                temp_avg__gte=safe.temp_min, temp_avg__lte=safe.temp_max, hum_avg__gte=safe.hum_min, hum_avg__lte=safe.hum_max,
            )),
        )
        total += summarised['total'] or 0
        inside_count += summarised['inside'] or 0
    if not total:
        return None
    return {'in_range_pct': round(inside_count / total * 100), 'readings': total}


def _curve(batch, records):
    """The harvest so far as it grew, one point per record, by the day since the batch started."""
    points, running = [], Decimal(0)
    for record in records:
        running += record.cocoon_weight_kg
        day = (record.harvested_at.date() - aware(batch.start_date).date()).days
        points.append({'day': max(day, 0), 'kg': _kg(running)})
    return points


def compare_batches(user, ids: list[str]) -> list[dict]:
    """The comparison for `ids`, in the order given. Raises NotFound when any of them is not one the user may see."""
    found = {
        batch.pk: batch
        for batch in with_counts(scope_batches(user, Batch.objects.filter(pk__in=ids)).select_related('farm'))
        .annotate(problem_alert_total=alert_count(PROBLEM_ALERTS))
    }
    if len(found) != len(ids):
        raise NotFound(NOT_FOUND)

    deaths = dict(
        MortalityRecord.objects.filter(batch_id__in=ids, is_active=True)
        .values_list('batch_id').annotate(total=Sum('count'))
    )
    grasserie = dict(
        DiseaseDetection.objects.filter(batch_id__in=ids, result='Grasserie')
        .values_list('batch_id').annotate(total=Count('pk'))
    )
    records = defaultdict(list)
    for record in HarvestRecord.objects.live().filter(batch_id__in=ids).order_by('harvested_at', 'created_at'):
        records[record.batch_id].append(record)

    now = timezone.now()
    ranges = _safe_ranges()
    split = split_point()     # once for every batch: where the raw readings stop and the hourly summaries begin
    rows = []
    for batch_id in ids:
        batch = found[batch_id]
        mine = records[batch_id]
        kg = _kg(sum((r.cocoon_weight_kg for r in mine), Decimal(0)))
        died = deaths.get(batch_id, 0)
        rate = None
        if batch.quantity_unit == 'WORMS' and batch.quantity:
            rate = round(died / batch.quantity * 100, 1)
        rows.append({
            'id': batch.pk,
            'code': batch.pk[-8:].upper(),
            'farm': {'id': batch.farm_id, 'name': batch.farm.name},
            'breed': batch.breed,
            'stage': batch.stage,
            'room': batch.room.name if batch.room else None,
            'start_date': aware(batch.start_date),
            'expected_harvest_date': aware(batch.expected_harvest_date),
            'days_running': max((now - aware(batch.start_date)).days, 0),
            'quantity': batch.quantity,
            'quantity_unit': batch.quantity_unit,
            'deaths': died,
            'death_rate_pct': rate,
            'harvest': {
                'records': len(mine),
                'cocoon_kg': kg,
                'silk_g': _kg(sum((r.silk_yield_g or 0 for r in mine), Decimal(0))),
                'grades': {grade: sum(1 for r in mine if r.quality_grade == grade) for grade in QualityGrade.values},
                'yield_per_unit': _yield_per_unit(batch, kg),
                'curve': _curve(batch, mine),
            },
            'conditions': _conditions(batch, ranges, split),
            'checks': {'total': batch.detection_total, 'grasserie': grasserie.get(batch_id, 0)},
            'alerts': batch.problem_alert_total,
        })
    return rows
