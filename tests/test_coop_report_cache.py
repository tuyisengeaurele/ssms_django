"""The cooperative report on screen is kept for a minute, so opening it again does not ask the database 16 questions again.

Each question is a round trip to a database in another country. What is kept is the report for one cooperative, one period and one
kind of reader, and nothing else. A download (CSV or PDF) is a document that gets passed around, so it is always made fresh.
"""
from datetime import datetime
from datetime import timezone as dt_timezone

import pytest
from django.core.cache import caches

from alerts.models import AlertLog
from reports import coop_cache
from tests.factories import AlertLogFactory, BatchFactory, CooperativeFactory, FarmFactory, UserFactory
from tests.query_growth import queries_for

pytestmark = pytest.mark.django_db

URL = '/api/reports/cooperative'
RANGE = 'from=2026-03-01&to=2026-03-31'
MARCH = datetime(2026, 3, 10, 12, 0, tzinfo=dt_timezone.utc)


@pytest.fixture
def coop():
    return CooperativeFactory(name='Gatsibo Silk')


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop)


@pytest.fixture
def farm(coop):
    return FarmFactory(owner=UserFactory(role='FARMER', cooperative=coop))


def raise_alert(farm):
    row = AlertLogFactory(batch=BatchFactory(farm=farm), type='DISEASE', message='x')
    AlertLog.objects.filter(pk=row.pk).update(created_at=MARCH)


def report(client, query=RANGE):
    response = client.get(f'{URL}?{query}')
    assert response.status_code == 200, response.content[:300]
    return response.json()['data']


def test_it_is_kept_for_a_minute():
    assert coop_cache.REPORT_SECONDS == 60


def test_the_second_ask_makes_almost_no_queries(auth_client, supervisor, farm):
    raise_alert(farm)
    client = auth_client(supervisor)
    client.get(f'{URL}?{RANGE}')   # the report is made, and kept
    kept = queries_for(client, f'{URL}?{RANGE}')
    assert kept <= 4, f'{kept} queries when the report was kept'


def test_a_change_inside_the_minute_is_not_shown_until_it_is_over(auth_client, supervisor, farm):
    client = auth_client(supervisor)
    raise_alert(farm)
    assert report(client)['alerts']['total'] == 1
    raise_alert(farm)
    assert report(client)['alerts']['total'] == 1   # still the report made a moment ago
    caches['reports'].clear()                        # the minute is over
    assert report(client)['alerts']['total'] == 2


def test_it_is_stored_for_the_minute_and_no_longer(auth_client, supervisor, farm, monkeypatch):
    stored = []
    real = caches['reports'].set
    monkeypatch.setattr(caches['reports'], 'set', lambda key, value, timeout=None, **kw: (stored.append(timeout), real(key, value, timeout, **kw))[1])
    report(auth_client(supervisor))
    assert stored == [60]


def test_each_period_has_its_own_report(auth_client, supervisor, farm):
    client = auth_client(supervisor)
    raise_alert(farm)
    assert report(client, 'from=2026-03-01&to=2026-03-31')['alerts']['total'] == 1
    assert report(client, 'from=2026-04-01&to=2026-04-30')['alerts']['total'] == 0
    assert report(client, 'from=2026-03-01&to=2026-03-31')['period'] == {'from': '2026-03-01', 'to': '2026-03-31'}


def test_each_cooperative_has_its_own_report(auth_client, coop, farm):
    other = CooperativeFactory(name='Nyagatare Silk')
    raise_alert(farm)
    admin = auth_client(UserFactory(role='ADMIN'))
    mine = report(admin, f'{RANGE}&cooperative={coop.pk}')
    theirs = report(admin, f'{RANGE}&cooperative={other.pk}')
    assert mine['cooperative']['name'] == 'Gatsibo Silk'
    assert mine['alerts']['total'] == 1
    assert theirs['cooperative']['name'] == 'Nyagatare Silk'
    assert theirs['alerts']['total'] == 0


def test_a_supervisor_is_never_given_the_report_an_admin_asked_for(auth_client, coop, supervisor, farm):
    other_farm = FarmFactory(owner=UserFactory(role='FARMER', cooperative=CooperativeFactory(name='Nyagatare Silk')))
    raise_alert(farm)
    raise_alert(other_farm)
    everything = report(auth_client(UserFactory(role='ADMIN')), f'{RANGE}&cooperative=all')
    assert everything['alerts']['total'] == 2
    own = report(auth_client(supervisor), f'{RANGE}&cooperative=all')   # a supervisor's cooperative is not a choice
    assert own['alerts']['total'] == 1
    assert own['cooperative']['name'] == 'Gatsibo Silk'


def test_a_download_is_always_made_fresh(auth_client, supervisor, farm):
    client = auth_client(supervisor)
    raise_alert(farm)
    assert report(client)['alerts']['total'] == 1
    raise_alert(farm)
    csv = client.get(f'{URL}?{RANGE}&export=csv')
    assert csv.status_code == 200
    body = b''.join(csv.streaming_content).decode()
    assert 'Alerts,Total,2' in body.replace('\r', '')


def test_a_bad_period_is_refused_and_not_kept(auth_client, supervisor, monkeypatch):
    stored = []
    monkeypatch.setattr(caches['reports'], 'set', lambda *args, **kwargs: stored.append(args))
    assert auth_client(supervisor).get(f'{URL}?from=2026-04-01&to=2026-03-01').status_code == 422
    assert stored == []
