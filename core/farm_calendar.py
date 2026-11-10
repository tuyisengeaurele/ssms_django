"""The farm calendar: the dated events a person may see.

Every event is a fact the system holds, a date somebody typed or something that happened. Nothing is predicted: the
expected harvest of a batch is the date the farmer typed when they made it, because how long a cycle takes is not ours
to guess. What each person sees follows `core.access`: a farmer their own batches, a supervisor their cooperative's, an
admin everything. The page words each event from its kind and its detail, so the server sends no sentences.
"""
import re
from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_timezone

from django.db.models import Exists, OuterRef
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from alerts.models import AlertLog
from batches.models import BatchStage
from core.access import scope_batches, scope_by_batch
from core.params import ParamError, date_param
from core.permissions import RolePermission
from core.timeutil import aware
from core.utils import api_success
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection
from supply.models import EggRequest, SupplyRound
from supply.rounds import staff_rounds

MAX_DAYS = 100
MAX_EVENTS = 500
# Same day: the ones that matter first.
_ORDER = ('round_deadline', 'round_delivery', 'disease_check', 'stage_changed', 'harvest_recorded', 'harvest_expected', 'batch_started')
# A round a person may read about. A draft is not public yet and a cancelled one is not going to happen.
_LIVE_ROUNDS = ('open', 'closed', 'allocated', 'done')
_STAGES = {stage.value for stage in BatchStage}
_STAGE_IN_MESSAGE = re.compile(r'\bto ([A-Z]+)\b')


def _day(moment) -> date:
    return timezone.localtime(aware(moment)).date()


def _bounds(start: date, end: date):
    low = datetime.combine(start, time.min, tzinfo=dt_timezone.utc)
    return low, datetime.combine(end + timedelta(days=1), time.min, tzinfo=dt_timezone.utc)


def _event(kind, when, *, expected=False, batch=None, farm=None, detail=None, key=''):
    farm = farm or (batch.farm if batch is not None else None)
    return {
        'id': f'{kind}:{key}',
        'date': when.isoformat(),
        'kind': kind,
        'expected': expected,
        'batch_id': batch.pk if batch is not None else None,
        'farm_id': farm.pk if farm is not None else None,
        'farm_name': farm.name if farm is not None else '',
        'detail': detail or {},
    }


def _batch_events(user, low, high):
    batches = scope_batches(user).select_related('farm')
    for b in batches.filter(start_date__gte=low, start_date__lt=high):
        yield _event('batch_started', _day(b.start_date), batch=b, key=b.pk)
    harvested = HarvestRecord.objects.filter(batch=OuterRef('pk'), is_active=True)
    waiting = batches.filter(expected_harvest_date__gte=low, expected_harvest_date__lt=high).filter(~Exists(harvested))
    for b in waiting:
        yield _event('harvest_expected', _day(b.expected_harvest_date), expected=True, batch=b, key=b.pk)

    checks = scope_by_batch(user, DiseaseDetection.objects.filter(detected_at__gte=low, detected_at__lt=high).select_related('batch__farm'))
    for c in checks:
        yield _event('disease_check', _day(c.detected_at), batch=c.batch, detail={'result': c.result}, key=c.pk)

    records = scope_by_batch(user, HarvestRecord.objects.filter(is_active=True, harvested_at__gte=low, harvested_at__lt=high).select_related('batch__farm'))
    for r in records:
        yield _event('harvest_recorded', _day(r.harvested_at), batch=r.batch, key=r.pk)

    changes = scope_by_batch(user, AlertLog.objects.filter(type='STAGE_CHANGE', batch__isnull=False, created_at__gte=low, created_at__lt=high).select_related('batch__farm'))
    for a in changes:
        named = _STAGE_IN_MESSAGE.search(a.message or '')
        stage = named.group(1) if named and named.group(1) in _STAGES else None
        yield _event('stage_changed', _day(a.created_at), batch=a.batch, detail={'stage': stage}, key=a.pk)


def _round_detail(r: SupplyRound) -> dict:
    return {'round_id': r.pk, 'name': r.name, 'place': r.delivery_place}


def _round_events(user, start, end, low, high):
    if user.role == 'FARMER':
        if not user.cooperative_id:
            return
        rounds = SupplyRound.objects.filter(cooperative_id=user.cooperative_id, status__in=_LIVE_ROUNDS)
        delivering = set(
            EggRequest.objects.filter(farmer=user, status__in=('approved', 'part_approved', 'received')).values_list('round_id', flat=True)
        )
    else:
        rounds = staff_rounds(user).filter(status__in=_LIVE_ROUNDS)
        delivering = None
    for r in rounds.filter(request_deadline__gte=low, request_deadline__lt=high):
        yield _event('round_deadline', _day(r.request_deadline), detail=_round_detail(r), key=r.pk)
    for r in rounds.filter(delivery_date__gte=start, delivery_date__lte=end):
        if delivering is None or r.pk in delivering:
            yield _event('round_delivery', r.delivery_date, detail=_round_detail(r), key=r.pk)


def events(user, start: date, end: date) -> tuple[list[dict], bool]:
    """The events from `start` to `end`, both days included, and whether more than the limit existed."""
    low, high = _bounds(start, end)
    found = [*_batch_events(user, low, high), *_round_events(user, start, end, low, high)]
    found.sort(key=lambda e: (e['date'], _ORDER.index(e['kind']), e['id']))
    return found[:MAX_EVENTS], len(found) > MAX_EVENTS


def _window(request) -> tuple[date, date]:
    start, end = date_param(request, 'from'), date_param(request, 'to')
    if start is None and end is None:
        today = timezone.now().date()
        first = today.replace(day=1)
        return first, (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    if start is None or end is None:
        raise ParamError('Please send both "from" and "to", or neither for this month.')
    if start > end:
        raise ParamError('"from" must be the same day as "to" or earlier.')
    if (end - start).days >= MAX_DAYS:
        raise ParamError(f'Please ask for at most {MAX_DAYS} days at a time.')
    return start, end


class CalendarView(APIView):
    """GET /api/calendar?from=2026-11-01&to=2026-11-30, the dated events of the farms this person may see."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'calendar'

    def get(self, request):
        start, end = _window(request)
        found, truncated = events(request.user, start, end)
        return api_success({'events': found, 'from': start.isoformat(), 'to': end.isoformat(), 'truncated': truncated})

