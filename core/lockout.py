"""Slow down password guessing: 5 wrong passwords for one email lock it for 15 minutes.

Unknown emails are counted exactly like real ones, so the lock gives no hint about who has an account.
The counters live in the shared cache, so every worker sees them.
"""
import hashlib
import time

from django.core.cache import cache

MAX_FAILURES = 5
WINDOW_SECONDS = 15 * 60
LOCK_SECONDS = 15 * 60


def _key(kind: str, email: str) -> str:
    normalised = (email or '').strip().lower()
    return f'lockout:{kind}:{hashlib.sha256(normalised.encode()).hexdigest()}'


def is_locked(email: str) -> int:
    """Seconds left on the lock, or 0 when the email may try."""
    until = cache.get(_key('until', email))
    if not until:
        return 0
    return max(0, int(until - time.time()))


def record_failure(email: str) -> None:
    failures = (cache.get(_key('fails', email)) or 0) + 1
    cache.set(_key('fails', email), failures, WINDOW_SECONDS)
    if failures >= MAX_FAILURES:
        cache.set(_key('until', email), time.time() + LOCK_SECONDS, LOCK_SECONDS)


def clear(email: str) -> None:
    cache.delete_many([_key('fails', email), _key('until', email)])
