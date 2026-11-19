"""The cooperative report: what happened on the farms of one cooperative, or of all of them, over a range of dates.

The numbers for the period are counts of real records made inside it: harvests, disease checks and alerts. The risk level
of each farm is not for the period. It is how the farm stands today, as in the supervisor's ranking (see farms/risk.py).

The whole report is answered with a fixed number of queries, however many farms there are.
"""
import re
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from alerts.models import AlertLog
from batches.models import Batch
from farms.risk import farm_risk
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection

DEFAULT_DAYS = 30
MAX_DAYS = 366
BAD_DATE = 'Please give dates as year, month and day, for example 2026-10-31.'
END_BEFORE_START = 'The end date cannot be before the start date.'
TOO_LONG = 'A report can cover up to one year.'
NO_COOPERATIVE = 'You are not part of a cooperative yet.'

_DAY = re.compile(r'^\d{4}-\d{2}-\d{2}$')


class ReportInputError(Exception):
    """The dates asked for cannot make a report. The message is kind enough to show."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _parse(value: str) -> date:
    if not _DAY.match(value):
        raise ReportInputError(BAD_DATE)
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ReportInputError(BAD_DATE) from None


def parse_period(from_raw: str | None, to_raw: str | None, today: date) -> tuple[date, date]:
    """The first and last day of the report, both included. No end means today. No start means thirty days up to the end."""
    end = _parse(to_raw) if to_raw else today
    start = _parse(from_raw) if from_raw else end - timedelta(days=DEFAULT_DAYS - 1)
    if end < start:
        raise ReportInputError(END_BEFORE_START)
    if (end - start).days + 1 > MAX_DAYS:
        raise ReportInputError(TOO_LONG)
    return start, end


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """From the first moment of the first day up to, but not including, the first moment after the last day."""
    zone = timezone.get_current_timezone()
    return datetime.combine(start, time.min, tzinfo=zone), datetime.combine(end + timedelta(days=1), time.min, tzinfo=zone)


def cooperative_report(farms, cooperative, start: date, end: date) -> dict:
    """The report as a dict. `farms` is the queryset the caller may see, already narrowed to the cooperative asked for."""
    now = timezone.now()
    lo, hi = _bounds(start, end)
    ranking = farm_risk(farms)
    ids = [row['id'] for row in ranking]

    started = Batch.objects.filter(farm_id__in=ids, is_active=True, start_date__gte=lo, start_date__lt=hi).count()
    farmers = farms.values('owner_id').distinct().count()

    # ── harvest ─────────────────────────────────────────────────────────────
    # One query, by farm and grade, and the totals are added up here: it was three queries for the same rows.
    made = HarvestRecord.objects.live().filter(batch__farm_id__in=ids, batch__is_active=True, harvested_at__gte=lo, harvested_at__lt=hi)
    harvest_rows = made.values('batch__farm_id', 'quality_grade').annotate(count=Count('id'), kg=Sum('cocoon_weight_kg'), silk=Sum('silk_yield_g'))
    records = kg = silk = 0
    grade_count: dict = defaultdict(int)
    grade_kg: dict = defaultdict(int)
    kg_by_farm: dict = defaultdict(int)
    for r in harvest_rows:
        records += r['count']
        kg += r['kg'] or 0
        silk += r['silk'] or 0
        grade_count[r['quality_grade']] += r['count']
        grade_kg[r['quality_grade']] += r['kg'] or 0
        kg_by_farm[r['batch__farm_id']] += r['kg'] or 0
    totals = {'records': records, 'kg': kg, 'silk': silk}
    by_grade = [{'grade': grade, 'count': grade_count[grade], 'total_kg': float(grade_kg[grade])} for grade in sorted(grade_count)]

    # ── disease checks ──────────────────────────────────────────────────────
    checked = DiseaseDetection.objects.filter(batch__farm_id__in=ids, batch__is_active=True, detected_at__gte=lo, detected_at__lt=hi)
    by_result = [
        {'result': r['result'], 'count': r['count']}
        for r in checked.values('result').annotate(count=Count('id')).order_by('-count', 'result')
    ]
    checks_total = sum(r['count'] for r in by_result)

    # ── alerts ──────────────────────────────────────────────────────────────
    raised = AlertLog.objects.filter(
        Q(batch__farm_id__in=ids, batch__is_active=True) | Q(room__farm_id__in=ids, room__is_active=True),
        created_at__gte=lo, created_at__lt=hi,
    )
    # One query, by farm and type, added up here: it was three queries for the same rows.
    alert_rows = (
        raised.annotate(farm=Coalesce('batch__farm_id', 'room__farm_id')).values('farm', 'type')
        .annotate(n=Count('id'), acknowledged=Count('id', filter=Q(acknowledged_at__isnull=False)), resolved=Count('id', filter=Q(resolved_at__isnull=False)))
    )
    alert_totals = {'total': 0, 'acknowledged': 0, 'resolved': 0}
    type_count: dict = defaultdict(int)
    alerts_by_farm: dict = defaultdict(int)
    for r in alert_rows:
        alert_totals['total'] += r['n']
        alert_totals['acknowledged'] += r['acknowledged']
        alert_totals['resolved'] += r['resolved']
        type_count[r['type']] += r['n']
        alerts_by_farm[r['farm']] += r['n']
    alerts_by_type = [{'type': kind, 'count': type_count[kind]} for kind in sorted(type_count, key=lambda kind: (-type_count[kind], kind))]

    rows = []
    for row in ranking:
        # The exact position of a farm is for the map. It is not part of a document that gets passed around.
        shown = {k: v for k, v in row.items() if k != 'position'}
        shown['harvest_kg'] = float(kg_by_farm.get(row['id']) or 0)
        shown['alerts'] = alerts_by_farm.get(row['id'], 0)
        rows.append(shown)

    return {
        'generated_at': now.isoformat(),
        'cooperative': {'id': cooperative.pk, 'name': cooperative.name} if cooperative else None,
        'period': {'from': str(start), 'to': str(end)},
        'totals': {
            'farms': len(ranking), 'farmers': farmers,
            'batches_running': sum(r['active_batches'] for r in ranking), 'batches_started': started,
        },
        'harvest': {
            'records': totals['records'], 'total_kg': float(totals['kg'] or 0), 'silk_g': float(totals['silk'] or 0), 'by_grade': by_grade,
        },
        'checks': {
            'total': checks_total, 'found': checks_total - sum(r['count'] for r in by_result if r['result'] == 'Healthy'), 'by_result': by_result,
        },
        'alerts': {**alert_totals, 'by_type': alerts_by_type},
        'farms': rows,
    }
