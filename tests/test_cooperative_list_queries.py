"""The cooperative list counts members and farms in the same query, however many cooperatives there are.

It asked two questions for every cooperative (members, then farms), so a list of 5 cost 12 queries and a list of 40 would cost 82, each a
round trip to a database in another country.
"""
import pytest

from tests.factories import CooperativeFactory, FarmFactory, UserFactory
from tests.query_growth import queries_for

pytestmark = pytest.mark.django_db


def grow(count):
    for _ in range(count):
        coop = CooperativeFactory()
        FarmFactory(owner=UserFactory(role='FARMER', cooperative=coop))
        UserFactory(role='SUPERVISOR', cooperative=coop)


def test_the_list_costs_the_same_with_more_cooperatives(auth_client):
    client = auth_client(UserFactory(role='ADMIN'))
    grow(2)
    few = queries_for(client, '/api/cooperatives')
    grow(8)
    assert queries_for(client, '/api/cooperatives') == few


def test_the_counts_are_the_rule(auth_client):
    coop = CooperativeFactory(name='Counted')
    other = CooperativeFactory(name='Other')
    owner = UserFactory(role='FARMER', cooperative=coop)
    FarmFactory(owner=owner)
    FarmFactory(owner=owner)
    FarmFactory(owner=owner, is_active=False)                          # a deleted farm is not counted
    FarmFactory(owner=UserFactory(role='FARMER', cooperative=other))   # another cooperative's farm is not counted
    UserFactory(role='SUPERVISOR', cooperative=coop)
    UserFactory(role='FARMER', cooperative=coop, is_active=False)      # a deactivated member is not counted
    supervisor_farm = FarmFactory(owner=UserFactory(role='SUPERVISOR', cooperative=coop))   # only farmers' farms count
    assert supervisor_farm.pk

    rows = {row['name']: row for row in auth_client(UserFactory(role='ADMIN')).get('/api/cooperatives').json()['data']}

    assert rows['Counted']['memberCount'] == 3        # the farmer, the supervisor, and the supervisor who owns a farm
    assert rows['Counted']['farmCount'] == 2
    assert rows['Other']['memberCount'] == 1 and rows['Other']['farmCount'] == 1


def test_a_cooperative_with_nothing_in_it_says_zero(auth_client):
    CooperativeFactory(name='Empty')
    rows = {row['name']: row for row in auth_client(UserFactory(role='ADMIN')).get('/api/cooperatives').json()['data']}
    assert rows['Empty']['memberCount'] == 0 and rows['Empty']['farmCount'] == 0


def test_one_cooperative_made_or_read_alone_still_counts(auth_client):
    coop = CooperativeFactory(name='Alone')
    UserFactory(role='SUPERVISOR', cooperative=coop)
    client = auth_client(UserFactory(role='ADMIN'))
    detail = client.get(f'/api/cooperatives/{coop.pk}').json()['data']
    assert detail['memberCount'] == 1
