"""A list page must cost the same number of queries for 12 farms as for 2.

A query per row is invisible on demo data and slow on a real cooperative. These tests grow the data and compare, so the
first one to add a query per row fails by name, whatever the exact count is today.
"""
import pytest

from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    FarmFactory,
    HarvestRecordFactory,
    IoTDeviceFactory,
    UserFactory,
)
from tests.query_growth import queries_for

pytestmark = pytest.mark.django_db

LISTS = [
    '/api/farms',
    '/api/batches/active',
    '/api/alerts',
    # One query per device for its latest reading (sensors/views.py, _serialize_device). Fixed in phase 2, task 2.5. The
    # case is strict, so the day it is fixed this mark has to be removed.
    pytest.param('/api/devices', marks=pytest.mark.xfail(strict=True, reason='N+1: latest reading per device')),
    '/api/harvest',
    '/api/calendar',
]


def grow(owner, count):
    """`count` more farms of this owner, each with a batch, an alert, a device and a harvest record."""
    for _ in range(count):
        farm = FarmFactory(owner=owner)
        batch = BatchFactory(farm=farm)
        AlertLogFactory(batch=batch)
        IoTDeviceFactory(farm=farm)
        HarvestRecordFactory(batch=batch)


@pytest.mark.parametrize('path', LISTS)
def test_a_list_costs_the_same_number_of_queries_with_more_rows(auth_client, path):
    owner = UserFactory(role='FARMER')
    client = auth_client(owner)
    grow(owner, 2)
    few = queries_for(client, path)
    grow(owner, 10)
    many = queries_for(client, path)
    assert many <= few + 1, f'{path} took {few} queries for 2 farms and {many} for 12'
