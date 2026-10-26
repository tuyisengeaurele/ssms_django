"""Who may see which farm and which records. Every view asks this module, none keeps its own rules.

* A farmer sees their own farms.
* A supervisor sees the farms of farmers in their cooperative, and nothing at all without a cooperative.
* An admin sees every farm that has not been deleted.
* A deleted farm or batch is hidden from everyone, admins included, and so is everything inside it.

The helpers return querysets, so a caller can keep filtering. Asking for one object that is out of
scope raises NotFound, so the API answers "not found" and never confirms that the record exists.
"""
from django.db.models import Q
from rest_framework.exceptions import NotFound

from batches.models import Batch
from farms.models import Farm


def _owner_q(user, owner_path: str) -> Q | None:
    """A filter on the farm owner, or None when the user may see nothing."""
    if user.role == 'ADMIN':
        return Q()
    if user.role == 'FARMER':
        return Q(**{owner_path: user})
    if user.role == 'SUPERVISOR' and user.cooperative_id:
        return Q(**{
            f'{owner_path}__cooperative_id': user.cooperative_id,
            f'{owner_path}__role': 'FARMER',
        })
    return None


def _narrow(qs, user, owner_path: str, **live):
    owner = _owner_q(user, owner_path)
    if owner is None:
        return qs.none()
    return qs.filter(owner, **live)


def scope_farms(user, qs=None):
    return _narrow(Farm.objects.all() if qs is None else qs, user, 'owner', is_active=True)


def scope_batches(user, qs=None):
    return _narrow(
        Batch.objects.all() if qs is None else qs, user, 'farm__owner',
        is_active=True, farm__is_active=True,
    )


def scope_by_batch(user, qs, lookup: str = 'batch'):
    """Rows that hang off a batch: readings, detections, alerts, harvest records."""
    return _narrow(
        qs, user, f'{lookup}__farm__owner',
        **{f'{lookup}__is_active': True, f'{lookup}__farm__is_active': True},
    )


def scope_by_farm(user, qs, lookup: str = 'farm'):
    """Rows that hang off a farm: devices."""
    return _narrow(qs, user, f'{lookup}__owner', **{f'{lookup}__is_active': True})


def get_farm_or_404(user, pk, qs=None) -> Farm:
    """The farm, or NotFound. Pass qs to start from a queryset with select_related or prefetch already set."""
    farm = scope_farms(user, qs).select_related('owner').filter(pk=pk).first()
    if farm is None:
        raise NotFound("We couldn't find that farm.")
    return farm


def get_batch_or_404(user, pk, qs=None) -> Batch:
    batch = scope_batches(user, qs).select_related('farm__owner').filter(pk=pk).first()
    if batch is None:
        raise NotFound("We couldn't find that batch.")
    return batch
