"""The first batch and the first harvest of a farmer are named in the answer, so the page can say a quiet well done."""
from datetime import timedelta

import pytest
from django.utils import timezone

from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, HarvestRecordFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner():
    return UserFactory(role='FARMER', cooperative=CooperativeFactory())


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner)


def make_batch(client, farm):
    payload = {'farmId': farm.pk, 'expectedHarvestDate': (timezone.now() + timedelta(days=25)).isoformat()}
    return client.post('/api/batches', payload, format='json')


def harvest(client, batch):
    return client.post(f'/api/harvest/batch/{batch.pk}', {'cocoonWeightKg': 5, 'qualityGrade': 'A'}, format='json')


# ── the first batch ─────────────────────────────────────────────────────────

def test_the_first_batch_of_a_farmer_is_named(auth_client, owner, farm):
    response = make_batch(auth_client(owner), farm)
    assert response.status_code == 201
    assert response.json()['data']['milestone'] == 'FIRST_BATCH'


def test_the_second_batch_is_not(auth_client, owner, farm):
    client = auth_client(owner)
    make_batch(client, farm)
    assert make_batch(client, farm).json()['data']['milestone'] is None


def test_a_batch_on_another_farm_of_the_same_farmer_is_not_the_first(auth_client, owner, farm):
    client = auth_client(owner)
    make_batch(client, farm)
    assert make_batch(client, FarmFactory(owner=owner)).json()['data']['milestone'] is None


def test_a_deleted_first_batch_still_counts_so_the_message_is_not_repeated(auth_client, owner, farm):
    client = auth_client(owner)
    first = make_batch(client, farm).json()['data']['id']
    client.delete(f'/api/batches/{first}')
    assert make_batch(client, farm).json()['data']['milestone'] is None


def test_each_farmer_has_a_first_of_their_own(auth_client, owner, farm):
    make_batch(auth_client(owner), farm)
    other = UserFactory(role='FARMER')
    assert make_batch(auth_client(other), FarmFactory(owner=other)).json()['data']['milestone'] == 'FIRST_BATCH'


def test_an_admin_starting_a_batch_for_a_farmer_gets_no_message_and_the_farmer_has_a_batch_already(auth_client, owner, farm):
    admin = auth_client(UserFactory(role='ADMIN'))
    assert make_batch(admin, farm).json()['data']['milestone'] is None
    assert make_batch(auth_client(owner), farm).json()['data']['milestone'] is None


# ── the first harvest ───────────────────────────────────────────────────────

def test_the_first_harvest_of_a_farmer_is_named(auth_client, owner, farm):
    batch = BatchFactory(farm=farm, stage='HARVEST')
    response = harvest(auth_client(owner), batch)
    assert response.status_code == 201
    assert response.json()['data']['milestone'] == 'FIRST_HARVEST'


def test_the_second_harvest_is_not(auth_client, owner, farm):
    batch = BatchFactory(farm=farm, stage='HARVEST')
    client = auth_client(owner)
    harvest(client, batch)
    assert harvest(client, batch).json()['data']['milestone'] is None


def test_a_deleted_first_harvest_still_counts(auth_client, owner, farm):
    batch = BatchFactory(farm=farm, stage='HARVEST')
    HarvestRecordFactory(batch=batch, is_active=False)
    assert harvest(auth_client(owner), batch).json()['data']['milestone'] is None


def test_a_harvest_on_another_batch_of_the_same_farmer_is_not_the_first(auth_client, owner, farm):
    HarvestRecordFactory(batch=BatchFactory(farm=farm, stage='HARVEST'))
    assert harvest(auth_client(owner), BatchFactory(farm=farm, stage='COCOON')).json()['data']['milestone'] is None


def test_an_admin_logging_a_harvest_for_a_farmer_gets_no_message_and_the_farmer_has_one_already(auth_client, owner, farm):
    batch = BatchFactory(farm=farm, stage='HARVEST')
    assert harvest(auth_client(UserFactory(role='ADMIN')), batch).json()['data']['milestone'] is None
    assert harvest(auth_client(owner), batch).json()['data']['milestone'] is None
