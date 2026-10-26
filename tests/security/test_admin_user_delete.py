"""Deleting a user is a soft delete: the account is switched off and hidden, never removed. An admin can restore it."""
import pytest
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from farms.models import Farm
from tests.factories import FarmFactory, UserFactory
from users.models import User

pytestmark = pytest.mark.django_db

URL = '/api/admin/users'


@pytest.fixture
def admin_client(auth_client):
    return auth_client(UserFactory(role='ADMIN'))


def delete(client, user):
    return client.delete(f'{URL}/{user.pk}')


def restore(client, user):
    return client.post(f'{URL}/{user.pk}/restore')


def test_deleting_a_user_keeps_the_row_and_marks_it_inactive(admin_client):
    farmer = UserFactory(role='FARMER')
    response = delete(admin_client, farmer)
    assert response.status_code == 200
    assert response.json()['message'] == 'User deleted.'
    farmer.refresh_from_db()
    assert farmer.is_active is False
    assert User.objects.filter(pk=farmer.pk).exists()


def test_deleting_a_farmer_keeps_their_farms(admin_client):
    farmer = UserFactory(role='FARMER')
    farm = FarmFactory(owner=farmer)
    delete(admin_client, farmer)
    assert Farm.objects.filter(pk=farm.pk).exists()


def test_a_deleted_user_cannot_sign_in_and_is_still_listed_as_deleted(admin_client):
    farmer = UserFactory(role='FARMER')
    delete(admin_client, farmer)
    login = APIClient().post('/api/auth/login', {'email': farmer.email, 'password': 'Pass1234'}, format='json')
    assert login.status_code in (401, 403)
    listed = {row['id']: row for row in admin_client.get(URL).json()['data']}
    assert listed[farmer.pk]['isActive'] is False


def test_deleting_is_audited(admin_client):
    farmer = UserFactory(role='FARMER')
    delete(admin_client, farmer)
    entry = AuditLog.objects.get(action='DELETE', resource='User')
    assert farmer.email in entry.detail


def test_an_admin_cannot_delete_their_own_account(auth_client):
    me = UserFactory(role='ADMIN')
    response = delete(auth_client(me), me)
    assert response.status_code == 400
    me.refresh_from_db()
    assert me.is_active is True


def test_restoring_brings_the_person_back_and_they_can_sign_in_again(admin_client):
    farmer = UserFactory(role='FARMER')
    delete(admin_client, farmer)
    response = restore(admin_client, farmer)
    assert response.status_code == 200
    assert response.json()['message'] == 'User restored.'
    farmer.refresh_from_db()
    assert farmer.is_active is True
    login = APIClient().post('/api/auth/login', {'email': farmer.email, 'password': 'Pass1234'}, format='json')
    assert login.status_code == 200


def test_restoring_keeps_the_role_and_the_cooperative(admin_client):
    supervisor = UserFactory(role='SUPERVISOR')
    coop_id = supervisor.cooperative_id
    delete(admin_client, supervisor)
    restore(admin_client, supervisor)
    supervisor.refresh_from_db()
    assert supervisor.role == 'SUPERVISOR'
    assert supervisor.cooperative_id == coop_id


def test_restoring_is_audited(admin_client):
    farmer = UserFactory(role='FARMER')
    delete(admin_client, farmer)
    restore(admin_client, farmer)
    entry = AuditLog.objects.get(action='UPDATE', resource='User', detail__contains='Restored')
    assert farmer.email in entry.detail


def test_restoring_someone_who_is_not_deleted_changes_nothing(admin_client):
    farmer = UserFactory(role='FARMER')
    assert restore(admin_client, farmer).status_code == 200
    farmer.refresh_from_db()
    assert farmer.is_active is True


def test_restoring_an_unknown_user_is_a_plain_404(admin_client):
    response = admin_client.post(f'{URL}/does-not-exist/restore')
    assert response.status_code == 404
    assert response.json()['message'] == "We couldn't find that user."


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_admins_can_delete_or_restore(auth_client, role):
    target = UserFactory(role='FARMER', is_active=False)
    client = auth_client(UserFactory(role=role))
    assert restore(client, target).status_code == 403
    target.refresh_from_db()
    assert target.is_active is False
    other = UserFactory(role='FARMER')
    assert delete(client, other).status_code == 403
    other.refresh_from_db()
    assert other.is_active is True


def test_signing_in_is_required_to_restore(api_client):
    target = UserFactory(role='FARMER', is_active=False)
    assert restore(api_client, target).status_code == 401
