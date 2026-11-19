"""A cooperative's supply settings are read once for a request, not once for every number that needs one.

The farmer's allowance card read the same row three times (the starting boxes, the amount, the capacity), and each read is a round
trip to a database in another country. The row is kept on the cooperative the request already holds, so it lives exactly as long
as the request does and the next request reads the row again.
"""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from supply.models import SupplySettings
from tests.factories import CooperativeFactory, UserFactory
from tests.query_growth import queries_for

pytestmark = pytest.mark.django_db


def test_the_second_read_for_the_same_cooperative_makes_no_query():
    coop = CooperativeFactory()
    first = SupplySettings.for_cooperative(coop)
    with CaptureQueriesContext(connection) as queries:
        second = SupplySettings.for_cooperative(coop)
    assert len(queries) == 0
    assert second is first


def test_another_instance_of_the_cooperative_reads_the_row_again():
    coop = CooperativeFactory()
    SupplySettings.for_cooperative(coop)
    SupplySettings.objects.filter(cooperative=coop).update(starter_boxes=5)
    assert SupplySettings.for_cooperative(type(coop).objects.get(pk=coop.pk)).starter_boxes == 5


def test_it_still_makes_the_row_when_a_cooperative_has_none():
    coop = CooperativeFactory()
    assert not SupplySettings.objects.filter(cooperative=coop).exists()
    assert SupplySettings.for_cooperative(coop).starter_boxes == 2
    assert SupplySettings.objects.filter(cooperative=coop).count() == 1


def test_the_allowance_card_reads_the_settings_once(auth_client):
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    client = auth_client(farmer)
    client.get('/api/supply/allowance')
    with CaptureQueriesContext(connection) as queries:
        assert client.get('/api/supply/allowance').status_code == 200
    reads = [q['sql'] for q in queries.captured_queries if 'supply_settings' in q['sql']]
    assert len(reads) <= 1, reads


def test_the_allowance_card_stays_within_six_queries(auth_client):
    farmer = UserFactory(role='FARMER', cooperative=CooperativeFactory())
    assert queries_for(auth_client(farmer), '/api/supply/allowance') <= 6
