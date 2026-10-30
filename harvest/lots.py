"""What a stranger who scans a lot's QR code is shown.

It is kept small on purpose. A lot is a farmer's own product, and the page is for a buyer who wants to know where it
came from. So it names the farm, the district and the dates, and gives the weight and the grade. It never names the
owner or gives their email, the street, the exact position of the farm, or the notes, which are free text.
"""
from core.timeutil import aware
from locations import registry

# The one answer for every link that does not work: never made, ended, unknown, or its lot, batch or farm was deleted.
NO_LONGER_VALID = 'This link is no longer valid.'


def public_lot(record) -> dict:
    batch = record.batch
    farm = batch.farm
    place = (registry.chain(farm.village_code) or {}) if farm.village_code else {}
    owner = farm.owner
    started = aware(batch.start_date).date()
    harvested = aware(record.harvested_at).date()
    return {
        'farm_name': farm.name,
        'province': place['province']['name'] if 'province' in place else None,
        'district': place['district']['name'] if 'district' in place else None,
        'cooperative_name': owner.cooperative.name if owner.cooperative_id else None,
        'breed': batch.breed or None,
        'grade': record.quality_grade,
        'cocoon_weight_kg': float(record.cocoon_weight_kg),
        'silk_yield_g': float(record.silk_yield_g) if record.silk_yield_g is not None else None,
        'started_on': started.isoformat(),
        'harvested_on': harvested.isoformat(),
        'rearing_days': max((harvested - started).days, 0),
    }
