"""What SSMS holds about one person, as plain data for them to keep.

It is built from the person's own rows only: the farms they own, and what hangs off those. Nothing is read through a role's
view of the data, so an admin who downloads gets their own records too, not everybody's. Deleted records are included and say so,
because the rows are kept. It holds no password hash, no token, no photo address and nobody else's number or email.
"""
from datetime import timedelta

from django.utils import timezone

from core.sensitive import mask_email

SECURITY_DAYS = 180


def _when(value):
    return value.isoformat() if value else None


def _text(value):
    """A decimal or other number as the text the database holds, so no digit is lost on the way to the file."""
    return None if value is None else str(value)


def _masked(detail: str) -> str:
    """An email in a line of the log is shown masked, as the log itself shows it. Words are looked at one by one, with no
    pattern to run slow on a line built for it."""
    words = (detail or '').split(' ')
    return ' '.join(mask_email(w) if w.count('@') == 1 and '***' not in w else w for w in words)


def _profile(user) -> dict:
    return {
        'id': user.pk,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'phone': user.phone,
        'phone_verified_at': _when(user.phone_verified_at),
        'preferred_language': user.preferred_language,
        'cooperative': user.cooperative.name if user.cooperative_id else None,
        'photo_url': user.photo_url,
        'is_email_verified': user.is_email_verified,
        'terms_accepted_at': _when(user.terms_accepted_at),
        'created_at': _when(user.created_at),
        'deletion_requested_at': _when(user.deletion_requested_at),
    }


def _farms(user) -> list[dict]:
    return [
        {
            'id': f.pk, 'name': f.name, 'location': f.location, 'street': f.street,
            'province_code': f.province_code, 'district_code': f.district_code, 'sector_code': f.sector_code,
            'cell_code': f.cell_code, 'village_code': f.village_code,
            'latitude': f.latitude, 'longitude': f.longitude, 'is_active': f.is_active, 'created_at': _when(f.created_at),
        }
        for f in user.farms.order_by('created_at', 'pk')
    ]


def _rooms(user) -> list[dict]:
    from farms.models import RearingRoom

    return [
        {
            'id': r.pk, 'farm_id': r.farm_id, 'name': r.name, 'notes': r.notes, 'area_m2': _text(r.area_m2),
            'approval_status': r.approval_status, 'is_active': r.is_active, 'created_at': _when(r.created_at),
        }
        for r in RearingRoom.objects.filter(farm__owner=user).order_by('created_at', 'pk')
    ]


def _batches(user) -> list[dict]:
    from batches.models import Batch

    return [
        {
            'id': b.pk, 'farm_id': b.farm_id, 'room_id': b.room_id, 'stage': b.stage, 'breed': b.breed, 'quantity': b.quantity,
            'quantity_unit': b.quantity_unit, 'lot_code': b.lot_code, 'notes': b.notes, 'start_date': _when(b.start_date),
            'expected_harvest_date': _when(b.expected_harvest_date), 'is_active': b.is_active,
        }
        for b in Batch.objects.filter(farm__owner=user).order_by('start_date', 'pk')
    ]


def _harvests(user) -> list[dict]:
    from harvest.models import HarvestRecord

    return [
        {
            'id': h.pk, 'batch_id': h.batch_id, 'cocoon_weight_kg': _text(h.cocoon_weight_kg), 'silk_yield_g': _text(h.silk_yield_g),
            'quality_grade': h.quality_grade, 'notes': h.notes, 'harvested_at': _when(h.harvested_at), 'is_active': h.is_active,
        }
        for h in HarvestRecord.objects.filter(batch__farm__owner=user).order_by('harvested_at', 'pk')
    ]


def _detections(user) -> list[dict]:
    """The result and the date of each photo check. The photo itself is not in the file."""
    from sensors.models import DiseaseDetection

    return [
        {
            'id': d.pk, 'batch_id': d.batch_id, 'result': d.result, 'confidence': d.confidence, 'detected_at': _when(d.detected_at),
            'is_correct': d.is_correct, 'actual_result': d.actual_result, 'notes': d.notes,
        }
        for d in DiseaseDetection.objects.filter(batch__farm__owner=user).order_by('detected_at', 'pk')
    ]


def _allowance(user) -> dict | None:
    from supply.models import Allowance, AllowanceChange

    current = Allowance.objects.select_related('cooperative').filter(farmer=user).first()
    history = [
        {
            'cooperative': c.cooperative.name, 'old_boxes': c.old_boxes, 'new_boxes': c.new_boxes, 'kind': c.kind, 'reason': c.reason,
            'decided_at': _when(c.decided_at),
        }
        for c in AllowanceChange.objects.select_related('cooperative').filter(farmer=user).order_by('decided_at', 'pk')
    ]
    if current is None and not history:
        return None
    return {
        'boxes': current.boxes if current else None,
        'cooperative': current.cooperative.name if current else None,
        'since': _when(current.since) if current else None,
        'history': history,
    }


def _cooperatives(user) -> list[dict]:
    from cooperatives.models import CooperativeMembership

    return [
        {'cooperative': m.cooperative.name, 'started_at': _when(m.started_at), 'ended_at': _when(m.ended_at)}
        for m in CooperativeMembership.objects.select_related('cooperative').filter(user=user).order_by('started_at', 'pk')
    ]


def _security_events(user) -> list[dict]:
    from logs.models import SecurityEvent
    from logs.security import KINDS

    since = timezone.now() - timedelta(days=SECURITY_DAYS)
    return [
        {'kind': e.kind, 'label': KINDS.get(e.kind, e.kind), 'at': _when(e.created_at), 'ip_address': e.ip_address, 'detail': _masked(e.detail)}
        for e in SecurityEvent.objects.filter(user=user, created_at__gte=since).order_by('created_at', 'pk')
    ]


def _messages(user) -> list[dict]:
    """A farmer gets both sides of their own conversations. Anybody gets what they wrote in somebody else's, and none of
    the other side. No name, email, number or id of another person."""
    from django.db.models import Q

    from messaging.models import Message

    found = (
        Message.objects.filter(Q(conversation__farmer=user) | Q(sender=user))
        .select_related('conversation__cooperative')
        .order_by('created_at', 'id')
    )
    rows = []
    for m in found:
        row = {'cooperative': m.conversation.cooperative.name}
        if m.conversation.farmer_id == user.pk:
            row['from'] = 'you' if m.sender_id == user.pk else 'cooperative'
        rows.append({**row, 'body': m.body, 'sent_at': _when(m.created_at)})
    return rows


def build_export(user) -> dict:
    """Everything SSMS holds about this person, as plain data."""
    return {
        'generated_at': _when(timezone.now()),
        'profile': _profile(user),
        'farms': _farms(user),
        'rooms': _rooms(user),
        'batches': _batches(user),
        'harvests': _harvests(user),
        'detections': _detections(user),
        'allowance': _allowance(user),
        'cooperatives': _cooperatives(user),
        'messages': _messages(user),
        'security_events': _security_events(user),
    }
