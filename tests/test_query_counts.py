"""The busiest endpoints ask the database the same number of questions however much data a person has.

A page that makes one query for every farm, batch or alert is fine with 2 farms and slow with 20, and every extra query
is a round trip to a database in another country. Each test builds a small world, counts the queries of one request,
adds farms of the same shape, and counts again. The two counts must match.
"""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    CooperativeFactory,
    FarmFactory,
    SensorReadingFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

# Most queries a single request may make, however much data there is. Authentication, the role and the data itself.
MOST_QUERIES = 12

# (who asks, what they ask for, the least rows the answer holds so an empty answer cannot pass)
CASES = [
    ('FARMER', '/api/auth/me', None),
    ('FARMER', '/api/farms', 2),
    ('SUPERVISOR', '/api/farms/risk', 2),
    ('FARMER', '/api/alerts', 2),
    ('SUPERVISOR', '/api/farms', 2),
    ('SUPERVISOR', '/api/batches/active', 2),
    ('ADMIN', '/api/farms', 2),
    ('ADMIN', '/api/cooperatives', 1),
    ('SUPERVISOR', '/api/team/farmers', 2),
]


def add_farms(role, user, cooperative, count):
    """`count` farms, each with 2 batches, and each batch with a sensor reading and 3 alerts."""
    for _ in range(count):
        owner = user if role == 'FARMER' else UserFactory(cooperative=cooperative)
        farm = FarmFactory(owner=owner)
        for _ in range(2):
            batch = BatchFactory(farm=farm)
            SensorReadingFactory(batch=batch)
            for _ in range(3):
                AlertLogFactory(batch=batch)


def queries_for(client, url):
    client.get(url)  # the first request pays for one-off lookups, which are not what is measured
    with CaptureQueriesContext(connection) as captured:
        response = client.get(url)
    assert response.status_code == 200, f'{url} answered {response.status_code}'
    return len(captured), response


@pytest.mark.parametrize('role,url,least_rows', CASES)
def test_the_query_count_does_not_grow_with_the_data(jwt_client, role, url, least_rows):
    cooperative = CooperativeFactory()
    user = UserFactory(role=role, cooperative=cooperative if role == 'SUPERVISOR' else None)
    client = jwt_client(user)

    add_farms(role, user, cooperative, 2)
    small, response = queries_for(client, url)
    add_farms(role, user, cooperative, 4)
    big, _ = queries_for(client, url)

    if least_rows is not None:
        rows = response.json().get('data')
        assert isinstance(rows, list) and len(rows) >= least_rows, f'{url} came back with {rows!r}'
    assert big == small, f'{role} {url}: {small} queries with 2 farms, {big} with 6'
    assert big <= MOST_QUERIES, f'{role} {url}: {big} queries'
