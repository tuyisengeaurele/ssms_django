"""Lot tracing: every batch that came from the same lot of eggs, and how each is doing.

A disease on one farm is a question about the others that got the same lot. This reads only, and reaches only what the
person may already see (a supervisor, their cooperative), so a lot of another cooperative looks the same as no lot.
"""
from alerts.models import AlertLog
from batches.models import Batch
from core.access import scope_batches
from sensors.models import DiseaseDetection

from .models import SupplyRound

DISEASE, HEALTHY, NOT_CHECKED = 'disease', 'healthy', 'not_checked'
# What the check says is a disease, and what it says is fine. Anything else is not a verdict, so the batch is not checked.
_VERDICT = {'Grasserie': DISEASE, 'Healthy': HEALTHY}
# The ones to look at first: a disease, then those nobody has checked, then the healthy.
_ORDER = {DISEASE: 0, NOT_CHECKED: 1, HEALTHY: 2}


def _latest_checks(batch_ids):
    """The newest check of each batch. A batch is not judged by an old result it has recovered from."""
    latest = {}
    for check in DiseaseDetection.objects.filter(batch_id__in=batch_ids).order_by('-detected_at'):
        latest.setdefault(check.batch_id, check)
    return latest


def trace(user, lot_code: str) -> dict | None:
    """The trace for a lot, or None when the person sees no batch of it."""
    batches = list(
        scope_batches(user, Batch.objects.filter(lot_code=lot_code)).select_related('farm', 'farm__owner', 'room')
    )
    if not batches:
        return None
    ids = [b.pk for b in batches]
    checks = _latest_checks(ids)
    open_alerts = set(AlertLog.objects.filter(batch_id__in=ids, type='DISEASE', resolved_at__isnull=True).values_list('batch_id', flat=True))

    rows = []
    for b in batches:
        check = checks.get(b.pk)
        rows.append({
            'id': b.pk,
            'stage': b.stage,
            'quantity': b.quantity,
            'quantity_unit': b.quantity_unit,
            'start_date': b.start_date,
            'status': _VERDICT.get(check.result, NOT_CHECKED) if check else NOT_CHECKED,
            'farm': {'id': b.farm_id, 'name': b.farm.name},
            'owner': {'id': b.farm.owner_id, 'name': b.farm.owner.name, 'email': b.farm.owner.email},
            'room': {'id': b.room_id, 'name': b.room.name} if b.room_id else None,
            'last_check': {'result': check.result, 'at': check.detected_at} if check else None,
            'open_alert': b.pk in open_alerts,
        })
    rows.sort(key=lambda r: (_ORDER[r['status']], r['start_date']))

    found = SupplyRound.objects.filter(lot_code=lot_code).first()
    if found and user.role != 'ADMIN' and found.cooperative_id != user.cooperative_id:
        found = None
    return {
        'lot_code': lot_code,
        'round': {'id': found.pk, 'name': found.name, 'delivery_date': found.delivery_date, 'status': found.status} if found else None,
        'summary': {
            'batches': len(rows),
            'farms': len({r['farm']['id'] for r in rows}),
            'disease': sum(r['status'] == DISEASE for r in rows),
            'healthy': sum(r['status'] == HEALTHY for r in rows),
            'not_checked': sum(r['status'] == NOT_CHECKED for r in rows),
        },
        'batches': rows,
    }
