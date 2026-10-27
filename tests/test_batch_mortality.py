"""Breed and quantity on a batch, and a log of the worms that died."""
from datetime import timedelta

import pytest
from django.utils import timezone

from audit_log.models import AuditLog
from batches.models import Batch, MortalityRecord
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner():
    return UserFactory(role='FARMER')


@pytest.fixture
def batch(owner):
    batch = BatchFactory(farm=FarmFactory(owner=owner))
    Batch.objects.filter(pk=batch.pk).update(start_date=timezone.now() - timedelta(days=10))
    batch.refresh_from_db()
    return batch


def today():
    return timezone.now().date()


def log(client, batch, **body):
    body = {'count': 12, **body}
    return client.post(f'/api/batches/{batch.pk}/mortality', body, format='json')


def entries(client, batch):
    return client.get(f'/api/batches/{batch.pk}/mortality').json()['data']


# ── the log ─────────────────────────────────────────────────────────────────

def test_a_farmer_records_deaths_with_a_note_and_a_day(auth_client, owner, batch):
    day = (today() - timedelta(days=2)).isoformat()
    response = log(auth_client(owner), batch, count=30, note='Hot afternoon', recordedOn=day)
    assert response.status_code == 201
    row = MortalityRecord.objects.get()
    assert (row.batch_id, row.count, row.note, row.recorded_on.isoformat(), row.is_active) == (batch.pk, 30, 'Hot afternoon', day, True)
    assert response.json()['message'] == 'Deaths recorded.'


def test_the_day_defaults_to_today_and_the_note_is_optional(auth_client, owner, batch):
    log(auth_client(owner), batch, count=5)
    row = MortalityRecord.objects.get()
    assert row.recorded_on == today()
    assert row.note == ''


def test_the_list_shows_the_latest_day_first(auth_client, owner, batch):
    client = auth_client(owner)
    log(client, batch, count=1, recordedOn=(today() - timedelta(days=5)).isoformat())
    log(client, batch, count=2, recordedOn=today().isoformat())
    log(client, batch, count=3, recordedOn=(today() - timedelta(days=1)).isoformat())
    assert [e['count'] for e in entries(client, batch)] == [2, 3, 1]


@pytest.mark.parametrize('body', [
    {'count': 0}, {'count': -4}, {'count': 'many'}, {'count': 2.5}, {'count': 10_000_001}, {},
    {'count': 5, 'note': 'x' * 501},
    {'count': 5, 'recordedOn': 'yesterday'},
])
def test_a_record_that_makes_no_sense_is_refused(auth_client, owner, batch, body):
    response = auth_client(owner).post(f'/api/batches/{batch.pk}/mortality', body, format='json')
    assert response.status_code == 422
    assert MortalityRecord.objects.count() == 0


def test_a_day_in_the_future_is_refused(auth_client, owner, batch):
    response = log(auth_client(owner), batch, recordedOn=(today() + timedelta(days=2)).isoformat())
    assert response.status_code == 422


def test_a_day_before_the_batch_started_is_refused(auth_client, owner, batch):
    response = log(auth_client(owner), batch, recordedOn=(today() - timedelta(days=30)).isoformat())
    assert response.status_code == 422


def test_recording_is_audited(auth_client, owner, batch):
    log(auth_client(owner), batch, count=7)
    entry = AuditLog.objects.get(action='CREATE', resource='Mortality')
    assert '7' in entry.detail


# ── deleting an entry ───────────────────────────────────────────────────────

def test_deleting_an_entry_hides_it_and_keeps_the_row(auth_client, owner, batch):
    client = auth_client(owner)
    log(client, batch, count=4)
    record = MortalityRecord.objects.get()
    assert client.delete(f'/api/batches/{batch.pk}/mortality/{record.pk}').status_code == 200
    assert entries(client, batch) == []
    record.refresh_from_db()
    assert record.is_active is False


def test_an_entry_cannot_be_deleted_through_another_batch(auth_client, owner, batch):
    other = BatchFactory(farm=FarmFactory(owner=owner))
    client = auth_client(owner)
    log(client, batch, count=4)
    record = MortalityRecord.objects.get()
    assert client.delete(f'/api/batches/{other.pk}/mortality/{record.pk}').status_code == 404
    assert MortalityRecord.objects.get().is_active is True


def test_an_unknown_entry_is_a_plain_404(auth_client, owner, batch):
    response = auth_client(owner).delete(f'/api/batches/{batch.pk}/mortality/nope')
    assert response.status_code == 404
    assert response.json()['message'] == "We couldn't find that entry."


# ── who may do what ─────────────────────────────────────────────────────────

def test_another_farmer_sees_and_changes_nothing(auth_client, owner, batch):
    log(auth_client(owner), batch)
    stranger = auth_client(UserFactory(role='FARMER'))
    assert stranger.get(f'/api/batches/{batch.pk}/mortality').status_code == 404
    assert log(stranger, batch).status_code == 404


def test_a_supervisor_of_the_cooperative_can_read_but_not_write(auth_client):
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    batch = BatchFactory(farm=FarmFactory(owner=farmer))
    log(auth_client(farmer), batch, count=3)
    supervisor = auth_client(UserFactory(role='SUPERVISOR', cooperative=coop))
    assert len(entries(supervisor, batch)) == 1
    assert log(supervisor, batch).status_code == 403
    record = MortalityRecord.objects.get()
    assert supervisor.delete(f'/api/batches/{batch.pk}/mortality/{record.pk}').status_code == 403


def test_an_admin_can_record(auth_client, batch):
    assert log(auth_client(UserFactory(role='ADMIN')), batch).status_code == 201


def test_signing_in_is_required(api_client, batch):
    assert api_client.get(f'/api/batches/{batch.pk}/mortality').status_code == 401
    assert log(api_client, batch).status_code == 401


def test_a_deleted_batch_has_no_log(auth_client, owner, batch):
    Batch.objects.filter(pk=batch.pk).update(is_active=False)
    assert auth_client(owner).get(f'/api/batches/{batch.pk}/mortality').status_code == 404


# ── breed and quantity ──────────────────────────────────────────────────────

def create(client, farm, **body):
    payload = {'farmId': farm.pk, 'expectedHarvestDate': (timezone.now() + timedelta(days=25)).isoformat(), **body}
    return client.post('/api/batches', payload, format='json')


def test_a_batch_is_created_with_breed_and_quantity(auth_client, owner):
    farm = FarmFactory(owner=owner)
    response = create(auth_client(owner), farm, breed='Bivoltine hybrid', quantity=3, quantityUnit='BOXES')
    assert response.status_code == 201
    batch = Batch.objects.get()
    assert (batch.breed, batch.quantity, batch.quantity_unit) == ('Bivoltine hybrid', 3, 'BOXES')
    data = response.json()['data']
    assert (data['breed'], data['quantity'], data['quantityUnit']) == ('Bivoltine hybrid', 3, 'BOXES')


def test_breed_and_quantity_are_optional(auth_client, owner):
    response = create(auth_client(owner), FarmFactory(owner=owner))
    assert response.status_code == 201
    batch = Batch.objects.get()
    assert (batch.breed, batch.quantity, batch.quantity_unit) == ('', None, 'BOXES')


@pytest.mark.parametrize('body', [
    {'quantity': 0}, {'quantity': -2}, {'quantity': 'lots'}, {'quantity': 10_000_001},
    {'quantityUnit': 'TONNES'}, {'breed': 'x' * 101},
])
def test_a_bad_breed_or_quantity_is_refused(auth_client, owner, body):
    response = create(auth_client(owner), FarmFactory(owner=owner), **body)
    assert response.status_code == 422
    assert Batch.objects.count() == 0


def test_a_farmer_can_correct_breed_quantity_and_notes_later(auth_client, owner, batch):
    response = auth_client(owner).patch(
        f'/api/batches/{batch.pk}',
        {'breed': 'Local', 'quantity': 2, 'quantityUnit': 'BOXES', 'notes': 'Moved to shed 2'},
        format='json',
    )
    assert response.status_code == 200
    batch.refresh_from_db()
    assert (batch.breed, batch.quantity, batch.notes) == ('Local', 2, 'Moved to shed 2')


def test_editing_cannot_change_the_stage_or_the_farm(auth_client, owner, batch):
    other_farm = FarmFactory(owner=owner)
    original_farm = batch.farm_id
    auth_client(owner).patch(f'/api/batches/{batch.pk}', {'stage': 'HARVEST', 'farmId': other_farm.pk, 'breed': 'Local'}, format='json')
    batch.refresh_from_db()
    assert (batch.stage, batch.farm_id, batch.breed) == ('EGG', original_farm, 'Local')


def test_only_the_owner_or_an_admin_can_edit(auth_client, batch):
    assert auth_client(UserFactory(role='FARMER')).patch(f'/api/batches/{batch.pk}', {'breed': 'X'}, format='json').status_code == 404
    assert auth_client(UserFactory(role='SUPERVISOR')).patch(f'/api/batches/{batch.pk}', {'breed': 'X'}, format='json').status_code == 403
    assert auth_client(UserFactory(role='ADMIN')).patch(f'/api/batches/{batch.pk}', {'breed': 'Admin edit'}, format='json').status_code == 200


def test_the_batch_page_data_carries_breed_quantity_and_the_deaths_so_far(auth_client, owner, batch):
    client = auth_client(owner)
    client.patch(f'/api/batches/{batch.pk}', {'breed': 'Local', 'quantity': 20000, 'quantityUnit': 'WORMS'}, format='json')
    log(client, batch, count=30)
    log(client, batch, count=70)
    gone = MortalityRecord.objects.filter(count=70).get()
    log(client, batch, count=5)
    client.delete(f'/api/batches/{batch.pk}/mortality/{gone.pk}')
    data = client.get(f'/api/batches/{batch.pk}').json()['data']
    assert (data['breed'], data['quantity'], data['quantityUnit']) == ('Local', 20000, 'WORMS')
    assert data['mortalityTotal'] == 35
