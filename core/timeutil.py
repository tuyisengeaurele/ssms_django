"""Dates that a database may hand back without a time zone."""
from datetime import timezone as dt_timezone

from django.utils import timezone


def aware(moment):
    """A date with its time zone, for taking away from the current time or turning into a local day.

    A database built before Django holds some dates without a time zone (the batch dates, for one), so Django returns
    them naive even though the project uses time zones. They were saved in UTC. A date that already has its time zone is
    returned as it is, and nothing stays nothing.
    """
    if moment is not None and timezone.is_naive(moment):
        return timezone.make_aware(moment, dt_timezone.utc)
    return moment
