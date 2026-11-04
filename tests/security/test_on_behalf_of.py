"""When an admin changes what a farmer owns, the audit log says whose it was, so nobody reads it as the farmer's own doing."""
from types import SimpleNamespace

import pytest
from rest_framework.test import APIRequestFactory

from audit_log.models import AuditLog
from audit_log.utils import log_action
from farms.models import RearingRoom
from tests.factories import BatchFactory, FarmFactory, HarvestRecordFactory, UserFactory

pytestmark = pytest.mark.django_db


def latest():
    return AuditLog.objects.order_by('-created_at', '-id').first()


def request_by(user):
    request = APIRequestFactory().post('/x')
    request.user = user
    return request


# ── log_action ──────────────────────────────────────────────────────────────────────────────

def test_the_entry_names_the_owner_when_somebody_else_made_the_change():
    admin, farmer = UserFactory(role='ADMIN'), UserFactory(role='FARMER')
    log_action(request_by(admin), 'UPDATE', 'Farm', 'f1', 'Updated farm: Gisenyi', owner=farmer)
    entry = latest()
    assert entry.detail == f'Updated farm: Gisenyi (on behalf of {farmer.email})'
    assert entry.user_email == admin.email


def test_the_entry_says_nothing_extra_when_the_owner_made_the_change():
    farmer = UserFactory(role='FARMER')
    log_action(request_by(farmer), 'UPDATE', 'Farm', 'f1', 'Updated farm: Gisenyi', owner=farmer)
    assert latest().detail == 'Updated farm: Gisenyi'


def test_the_entry_says_nothing_extra_when_no_owner_is_given():
    admin = UserFactory(role='ADMIN')
    log_action(request_by(admin), 'UPDATE', 'User', 'u1', 'Role changed')
    assert latest().detail == 'Role changed'


def test_an_owner_without_an_email_does_not_break_the_entry():
    admin = UserFactory(role='ADMIN')
    log_action(request_by(admin), 'UPDATE', 'Farm', 'f1', 'Updated farm', owner=SimpleNamespace(pk='x', email=''))
    assert latest().detail.startswith('Updated farm')


# ── the edits ───────────────────────────────────────────────────────────────────────────────

def a_farm(owner):
    return FarmFactory(owner=owner, name='Gisenyi Silk')


def edit_farm(client, farm, **_):
    return client.patch(f'/api/farms/{farm.pk}', {'name': 'Gisenyi Silk Two'}, format='json')


def delete_farm(client, farm, **_):
    return client.delete(f'/api/farms/{farm.pk}')


def add_room(client, farm, **_):
    return client.post(f'/api/farms/{farm.pk}/rooms', {'name': 'Room Z'}, format='json')


def edit_room(client, farm, **_):
    room = RearingRoom.objects.create(farm=farm, name='Room A')
    return client.patch(f'/api/rooms/{room.pk}', {'name': 'Room B'}, format='json')


def delete_room(client, farm, **_):
    room = RearingRoom.objects.create(farm=farm, name='Room A')
    return client.delete(f'/api/rooms/{room.pk}')


def delete_batch(client, farm, **_):
    batch = BatchFactory(farm=farm)
    return client.delete(f'/api/batches/{batch.pk}')


def delete_harvest(client, farm, **_):
    record = HarvestRecordFactory(batch=BatchFactory(farm=farm))
    return client.delete(f'/api/harvest/{record.pk}')


EDITS = [edit_farm, delete_farm, add_room, edit_room, delete_room, delete_batch, delete_harvest]


@pytest.mark.parametrize('edit', EDITS, ids=lambda f: f.__name__)
def test_an_admin_changing_a_farmers_data_leaves_an_entry_that_names_both(auth_client, edit):
    farmer, admin = UserFactory(role='FARMER'), UserFactory(role='ADMIN')
    response = edit(auth_client(admin), a_farm(farmer))
    assert response.status_code in (200, 201), response.content
    entry = latest()
    assert entry.user_email == admin.email
    assert f'(on behalf of {farmer.email})' in entry.detail


@pytest.mark.parametrize('edit', EDITS, ids=lambda f: f.__name__)
def test_a_farmer_changing_their_own_data_leaves_a_plain_entry(auth_client, edit):
    farmer = UserFactory(role='FARMER')
    response = edit(auth_client(farmer), a_farm(farmer))
    assert response.status_code in (200, 201), response.content
    entry = latest()
    assert entry.user_email == farmer.email
    assert 'on behalf' not in entry.detail


def test_an_admin_changing_a_farm_that_is_their_own_is_not_on_behalf_of_anyone(auth_client):
    admin = UserFactory(role='ADMIN')
    response = edit_farm(auth_client(admin), a_farm(admin))
    assert response.status_code == 200, response.content
    assert 'on behalf' not in latest().detail
