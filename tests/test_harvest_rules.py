"""Harvest records: only at the right stage, hidden when deleted, and listed a page at a time."""
from decimal import Decimal

import pytest

from audit_log.models import AuditLog
from harvest.models import HarvestRecord
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, HarvestRecordFactory, UserFactory

pytestmark = pytest.mark.django_db

ALL = '/api/harvest'


@pytest.fixture
def owner():
    return UserFactory(role='FARMER', cooperative=CooperativeFactory())


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner, name='Hill Farm')


def batch_at(farm, stage):
    return BatchFactory(farm=farm, stage=stage)


def record(client, batch, **body):
    return client.post(f'/api/harvest/batch/{batch.pk}', {'cocoonWeightKg': 12.5, 'qualityGrade': 'A', **body}, format='json')


# ── only at the right stage ─────────────────────────────────────────────────

@pytest.mark.parametrize('stage', ['EGG', 'LARVA', 'PUPA'])
def test_a_harvest_is_refused_before_the_cocoon_stage(auth_client, owner, farm, stage):
    batch = batch_at(farm, stage)
    response = record(auth_client(owner), batch)
    assert response.status_code == 422
    body = response.json()
    assert body['message'] == 'A harvest can be recorded once the batch has reached the cocoon stage.'
    assert body['errors']['batchId'] == [body['message']]
    assert HarvestRecord.objects.count() == 0


@pytest.mark.parametrize('stage', ['COCOON', 'HARVEST'])
def test_a_harvest_is_accepted_at_the_cocoon_and_harvest_stages(auth_client, owner, farm, stage):
    batch = batch_at(farm, stage)
    assert record(auth_client(owner), batch).status_code == 201
    assert HarvestRecord.objects.filter(batch=batch).count() == 1


def test_the_stage_is_checked_before_the_numbers(auth_client, owner, farm):
    """A batch that is too young gets the stage message, not a complaint about the form."""
    response = record(auth_client(owner), batch_at(farm, 'EGG'), cocoonWeightKg=-1)
    assert response.json()['message'] == 'A harvest can be recorded once the batch has reached the cocoon stage.'


def test_an_admin_is_held_to_the_same_stage_rule(auth_client, farm):
    response = record(auth_client(UserFactory(role='ADMIN')), batch_at(farm, 'LARVA'))
    assert response.status_code == 422


# ── hidden when deleted ─────────────────────────────────────────────────────

def test_deleting_a_record_hides_it_and_keeps_the_row(auth_client, owner, farm):
    batch = batch_at(farm, 'HARVEST')
    kept = HarvestRecordFactory(batch=batch)
    response = auth_client(owner).delete(f'{ALL}/{kept.pk}')
    assert response.status_code == 200
    kept.refresh_from_db()
    assert kept.is_active is False


def test_a_deleted_record_is_gone_from_every_list(auth_client, owner, farm):
    batch = batch_at(farm, 'HARVEST')
    gone = HarvestRecordFactory(batch=batch, notes='gone')
    stays = HarvestRecordFactory(batch=batch, notes='stays')
    client = auth_client(owner)
    client.delete(f'{ALL}/{gone.pk}')

    assert [r['id'] for r in client.get(ALL).json()['data']] == [stays.pk]
    assert [r['id'] for r in client.get(f'{ALL}/batch/{batch.pk}').json()['data']] == [stays.pk]
    assert [r['id'] for r in client.get(f'{ALL}?page=1').json()['data']] == [stays.pk]
    assert 'gone' not in client.get(f'{ALL}?export=csv').getvalue().decode()


def test_a_deleted_record_is_not_counted(auth_client, owner, farm):
    batch = batch_at(farm, 'HARVEST')
    gone = HarvestRecordFactory(batch=batch, cocoon_weight_kg=Decimal('10'))
    HarvestRecordFactory(batch=batch, cocoon_weight_kg=Decimal('4'), quality_grade='B')
    client = auth_client(owner)
    client.delete(f'{ALL}/{gone.pk}')
    stats = client.get(f'{ALL}/stats').json()['data']
    assert (stats['recordCount'], stats['totalWeightKg']) == (1, 4.0)
    assert [g['grade'] for g in stats['byGrade']] == ['B']
    assert [f['farm'] for f in stats['byFarm']] == ['Hill Farm']
    assert stats['byFarm'][0]['totalKg'] == 4.0


def test_a_deleted_record_is_not_in_the_admin_report(auth_client, farm):
    batch = batch_at(farm, 'HARVEST')
    HarvestRecordFactory(batch=batch)
    HarvestRecordFactory(batch=batch, is_active=False)
    admin = auth_client(UserFactory(role='ADMIN'))
    harvests = admin.get('/api/admin/reports').json()['data']['harvests']
    assert harvests['total'] == 1


def test_deleting_twice_says_not_found(auth_client, owner, farm):
    kept = HarvestRecordFactory(batch=batch_at(farm, 'HARVEST'))
    client = auth_client(owner)
    assert client.delete(f'{ALL}/{kept.pk}').status_code == 200
    assert client.delete(f'{ALL}/{kept.pk}').status_code == 404


def test_deleting_is_written_to_the_audit_log(auth_client, owner, farm):
    kept = HarvestRecordFactory(batch=batch_at(farm, 'HARVEST'))
    auth_client(owner).delete(f'{ALL}/{kept.pk}')
    entry = AuditLog.objects.get(resource='HarvestRecord', action='DELETE')
    assert entry.resource_id == kept.pk


# ── a page at a time ────────────────────────────────────────────────────────

def make(farm, count):
    batch = batch_at(farm, 'HARVEST')
    return [HarvestRecordFactory(batch=batch, notes=f'n{i}') for i in range(count)]


def test_without_a_page_the_list_is_one_flat_list(auth_client, owner, farm):
    make(farm, 3)
    body = auth_client(owner).get(ALL).json()
    assert len(body['data']) == 3
    assert 'pagination' not in body


def test_with_a_page_the_list_is_paginated(auth_client, owner, farm):
    make(farm, 5)
    body = auth_client(owner).get(f'{ALL}?page=1&page_size=2').json()
    assert len(body['data']) == 2
    assert body['pagination'] == {'page': 1, 'pageSize': 2, 'totalItems': 5, 'totalPages': 3, 'hasNext': True, 'hasPrev': False}


def test_the_last_page_holds_what_is_left(auth_client, owner, farm):
    make(farm, 5)
    body = auth_client(owner).get(f'{ALL}?page=3&page_size=2').json()
    assert len(body['data']) == 1
    assert body['pagination']['hasNext'] is False and body['pagination']['hasPrev'] is True


def test_pages_do_not_overlap_and_the_newest_comes_first(auth_client, owner, farm):
    rows = make(farm, 4)
    client = auth_client(owner)
    first = [r['id'] for r in client.get(f'{ALL}?page=1&page_size=2').json()['data']]
    second = [r['id'] for r in client.get(f'{ALL}?page=2&page_size=2').json()['data']]
    assert not set(first) & set(second)
    assert set(first + second) == {r.pk for r in rows}
    stamps = [r['harvestedAt'] for r in client.get(f'{ALL}?page=1&page_size=4').json()['data']]
    assert stamps == sorted(stamps, reverse=True)


def test_a_page_past_the_end_is_not_found(auth_client, owner, farm):
    make(farm, 2)
    assert auth_client(owner).get(f'{ALL}?page=9&page_size=2').status_code == 404


def test_a_page_never_holds_more_than_a_hundred(auth_client, owner, farm):
    make(farm, 3)
    assert auth_client(owner).get(f'{ALL}?page=1&page_size=500').json()['pagination']['pageSize'] == 100


def test_a_page_only_holds_what_the_caller_may_see(auth_client, owner, farm):
    make(farm, 2)
    HarvestRecordFactory(batch=BatchFactory(farm=FarmFactory(owner=UserFactory(role='FARMER')), stage='HARVEST'))
    assert auth_client(owner).get(f'{ALL}?page=1').json()['pagination']['totalItems'] == 2


def test_search_narrows_the_list_by_farm_grade_or_note(auth_client, owner, farm):
    batch = batch_at(farm, 'HARVEST')
    HarvestRecordFactory(batch=batch, notes='Very dry week', quality_grade='C')
    HarvestRecordFactory(batch=batch, notes='Fine', quality_grade='A')
    other = batch_at(FarmFactory(owner=owner, name='River Farm'), 'HARVEST')
    HarvestRecordFactory(batch=other, notes='Fine', quality_grade='A')
    client = auth_client(owner)

    def found(term):
        return client.get(f'{ALL}?page=1&search={term}').json()['pagination']['totalItems']

    assert (found('dry'), found('river'), found('HILL'), found('c'), found('nothing')) == (1, 1, 2, 1, 0)
