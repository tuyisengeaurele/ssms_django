"""Which farms need a look first, and why.

The rule is plain on purpose, so a supervisor can say it back to a farmer:

* HIGH: a disease alert in the last 14 days, or a temperature or humidity problem that is still open.
* MEDIUM: a sensor that is offline or in error.
* OK: none of those.

Each row also says where the farm goes on the map (see map_position).

Within a level the farm with more trouble comes first. A disease counts for 5, an air problem for 3 and a sensor for 2,
and farms with the same trouble are in name order. These are counts of real events, not a prediction.
"""
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone

from alerts.models import AlertLog, AlertType
from batches.models import Batch
from locations import registry
from sensors.devices import effective_status
from sensors.models import IoTDevice

RECENT_DISEASE_DAYS = 14
DISEASE_WEIGHT, AIR_WEIGHT, DEVICE_WEIGHT = 5, 3, 2
LEVEL_ORDER = {'HIGH': 0, 'MEDIUM': 1, 'OK': 2}


def _counted(rows) -> dict:
    return {farm_id: n for farm_id, n in rows}


def map_position(farm) -> dict | None:
    """Where a farm goes on the map, and how sure that is.

    exact: the spot its owner saved. village: the middle of its village outline. sector: the middle of its sector, for
    a village that has no outline. None for a farm from before places, which cannot be put on a map.
    """
    if farm.latitude is not None and farm.longitude is not None:
        return {'lat': farm.latitude, 'lng': farm.longitude, 'precision': 'exact'}
    for precision, point in (('village', registry.village_centre(farm.village_code)), ('sector', registry.sector_centre(farm.sector_code))):
        if point:
            return {**point, 'precision': precision}
    return None


def farm_risk(farms) -> list[dict]:
    """The farms of a queryset, most worrying first, each with its level and the counts behind it.

    Four grouped queries answer for every farm at once, so the cost does not grow with the number of farms.
    """
    farms = list(farms.select_related('owner'))
    ids = [farm.pk for farm in farms]
    now = timezone.now()

    air = _counted(
        AlertLog.objects.filter(
            type__in=[AlertType.TEMPERATURE, AlertType.HUMIDITY], resolved_at__isnull=True,
            room__farm_id__in=ids, room__is_active=True,
        ).values_list('room__farm_id').annotate(n=Count('id'))
    )
    disease = _counted(
        AlertLog.objects.filter(
            type=AlertType.DISEASE, created_at__gte=now - timedelta(days=RECENT_DISEASE_DAYS),
            batch__farm_id__in=ids, batch__is_active=True,
        ).values_list('batch__farm_id').annotate(n=Count('id'))
    )
    batches = _counted(Batch.objects.filter(farm_id__in=ids, is_active=True).values_list('farm_id').annotate(n=Count('id')))
    quiet: dict = {}
    for device in IoTDevice.objects.filter(farm_id__in=ids, is_active=True).only('farm_id', 'status', 'last_seen'):
        if effective_status(device, now) != IoTDevice.STATUS_ONLINE:
            quiet[device.farm_id] = quiet.get(device.farm_id, 0) + 1

    rows = []
    for farm in farms:
        d, a, o = disease.get(farm.pk, 0), air.get(farm.pk, 0), quiet.get(farm.pk, 0)
        level = 'HIGH' if d or a else 'MEDIUM' if o else 'OK'
        rows.append({
            'id': farm.pk, 'name': farm.name, 'owner_name': farm.owner.name, 'location': farm.location,
            'level': level, 'score': d * DISEASE_WEIGHT + a * AIR_WEIGHT + o * DEVICE_WEIGHT,
            'disease_alerts': d, 'open_air_alerts': a, 'offline_devices': o, 'active_batches': batches.get(farm.pk, 0),
            'position': map_position(farm),
        })
    rows.sort(key=lambda row: (LEVEL_ORDER[row['level']], -row['score'], row['name'].casefold()))
    return rows
