"""The rate limits count in memory, not in the database.

Counting in the database cost six round trips to Supabase on every request (read, count, savepoint, check, write,
release), more than the page's own data. Sign in lockout, the code challenges and stream tickets stay in the database
cache because they must survive a restart or be shared with another process. Only the rate limit counters moved.
"""
import pytest
from django.core.cache import caches
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from core import throttles
from tests.factories import FarmFactory, UserFactory

pytestmark = [pytest.mark.django_db, pytest.mark.throttle]


def all_throttles():
    found, queue = set(), [SimpleRateThrottle]
    while queue:
        for sub in queue.pop().__subclasses__():
            if sub not in found:
                found.add(sub)
                queue.append(sub)
    return found


def test_a_rate_limited_request_asks_the_database_nothing_about_the_limit(jwt_client):
    owner = UserFactory(role='FARMER')
    FarmFactory(owner=owner)
    client = jwt_client(owner)
    client.get('/api/auth/me')
    with CaptureQueriesContext(connection) as captured:
        assert client.get('/api/auth/me').status_code == 200
    cache_queries = [q['sql'] for q in captured.captured_queries if 'django_cache' in q['sql']]
    assert cache_queries == []
    assert len(captured) == 1  # only the user lookup, nothing for the limit


def all_views():
    import ssms_django.urls  # noqa: F401  (loads every view)
    found, queue = set(), [APIView]
    while queue:
        for sub in queue.pop().__subclasses__():
            if sub not in found:
                found.add(sub)
                queue.append(sub)
    return found


def test_every_view_throttle_counts_in_the_memory_cache():
    checked = 0
    for view in all_views():
        for throttle in view.throttle_classes:
            assert throttle.cache is caches['throttle'], f'{view.__name__} uses {throttle.__name__}, which counts in the database'
            checked += 1
    assert checked > 50, 'the walk found too few views to be trusted'
    for throttle in all_throttles():
        if throttle.__module__.startswith('core.'):
            assert throttle.cache is caches['throttle'], f'{throttle.__name__} counts in the database'


def test_the_default_throttles_are_ours(settings):
    classes = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES']
    assert classes == ['core.throttles.AnonRateThrottle', 'core.throttles.UserRateThrottle']


def test_the_views_use_our_throttles_not_the_database_ones():
    from rest_framework.throttling import AnonRateThrottle as DbAnon
    from rest_framework.throttling import UserRateThrottle as DbUser
    assert throttles.AnonRateThrottle is not DbAnon
    assert throttles.UserRateThrottle is not DbUser
    assert issubclass(throttles.UserRateThrottle, DbUser)


def test_the_limit_still_refuses_the_request_over_it(auth_client, monkeypatch):
    monkeypatch.setattr(throttles.UserRateThrottle, 'rate', '3/minute', raising=False)
    owner = UserFactory(role='FARMER')
    client = auth_client(owner)
    codes = [client.get('/api/auth/me').status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_lockout_and_challenges_still_use_the_database_cache():
    assert 'DatabaseCache' in caches['default'].__class__.__name__
    assert 'LocMemCache' in caches['throttle'].__class__.__name__
