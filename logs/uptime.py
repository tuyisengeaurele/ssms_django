"""Uptime from the health check rows.

A check that ran counts, and a stretch with no checks does not: no rows means unknown, not down. A service that is not
set up is counted neither way. The percent is of the checks that ran. `coverage` says how much of the window they
cover, so a figure built from two checks is not read as a day of proof.
"""
from datetime import timedelta

from django.utils import timezone

# The command runs every 5 minutes, so one row stands for this long.
CHECK_MINUTES = 5


def uptime_from_counts(ok: int, problem: int, window: timedelta) -> dict:
    samples = ok + problem
    coverage = min(1.0, samples * CHECK_MINUTES / (window.total_seconds() / 60)) if samples else 0.0
    return {
        'percent': round(100 * ok / samples, 1) if samples else None,
        'samples': samples,
        'coverage': coverage,
    }


def uptime(results, window: timedelta, now=None) -> dict:
    """Rows with a `checked_at` and a `status`, and the window that ends now."""
    now = now or timezone.now()
    since = now - window
    ok = problem = 0
    for result in results:
        if result.checked_at < since or result.checked_at > now:
            continue
        if result.status == 'ok':
            ok += 1
        elif result.status == 'problem':
            problem += 1
    return uptime_from_counts(ok, problem, window)
