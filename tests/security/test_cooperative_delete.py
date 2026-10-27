"""Deleting a cooperative switches it off and hides it. An admin can list the deleted ones and restore them."""
import pytest

from audit_log.models import AuditLog
from cooperatives.models import Cooperative
from tests.factories import CooperativeFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = '/api/cooperatives'


@pytest.fixture
def admin_client(auth_client):
    return auth_client(UserFactory(role='ADMIN'))


def names(response):
    return {row['name'] for row in response.json()['data']}


def test_a_deleted_cooperative_leaves_the_normal_list_and_keeps_its_row(admin_client):
    coop = CooperativeFactory(name='Gone Coop')
    assert admin_client.delete(f'{URL}/{coop.pk}').status_code == 200
    assert 'Gone Coop' not in names(admin_client.get(URL))
    assert Cooperative.objects.filter(pk=coop.pk, is_active=False).exists()


def test_deleting_says_deleted_and_is_audited(admin_client):
    coop = CooperativeFactory(name='Audited Coop')
    response = admin_client.delete(f'{URL}/{coop.pk}')
    assert response.json()['message'] == 'Cooperative deleted.'
    entry = AuditLog.objects.get(action='DELETE', resource='Cooperative')
    assert 'Audited Coop' in entry.detail


def test_an_admin_can_list_the_deleted_cooperatives(admin_client):
    CooperativeFactory(name='Live Coop')
    CooperativeFactory(name='Dead Coop', is_active=False)
    assert names(admin_client.get(f'{URL}?deleted=1')) == {'Dead Coop'}
    assert 'Dead Coop' not in names(admin_client.get(URL))


def test_other_people_never_see_deleted_cooperatives(auth_client):
    dead = CooperativeFactory(name='Dead Coop', is_active=False)
    member = UserFactory(role='SUPERVISOR', cooperative=dead)
    assert names(auth_client(member).get(f'{URL}?deleted=1')) == set()


def test_restoring_brings_a_cooperative_back_with_its_members(admin_client):
    coop = CooperativeFactory(name='Back Coop', is_active=False)
    member = UserFactory(role='FARMER', cooperative=coop)
    response = admin_client.post(f'{URL}/{coop.pk}/restore')
    assert response.status_code == 200
    assert response.json()['message'] == 'Cooperative restored.'
    assert 'Back Coop' in names(admin_client.get(URL))
    member.refresh_from_db()
    assert member.cooperative_id == coop.pk


def test_restoring_is_audited(admin_client):
    coop = CooperativeFactory(name='Audited Coop', is_active=False)
    admin_client.post(f'{URL}/{coop.pk}/restore')
    entry = AuditLog.objects.get(action='UPDATE', resource='Cooperative', detail__contains='Restored')
    assert 'Audited Coop' in entry.detail


def test_restoring_one_that_is_not_deleted_changes_nothing(admin_client):
    coop = CooperativeFactory(name='Fine Coop')
    assert admin_client.post(f'{URL}/{coop.pk}/restore').status_code == 200
    coop.refresh_from_db()
    assert coop.is_active is True


def test_restoring_an_unknown_cooperative_is_a_plain_404(admin_client):
    response = admin_client.post(f'{URL}/nope/restore')
    assert response.status_code == 404
    assert response.json()['message'] == "We couldn't find that cooperative."


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_admins_can_restore(auth_client, role):
    coop = CooperativeFactory(is_active=False)
    response = auth_client(UserFactory(role=role)).post(f'{URL}/{coop.pk}/restore')
    assert response.status_code == 403
    coop.refresh_from_db()
    assert coop.is_active is False


def test_signing_in_is_required_to_restore(api_client):
    coop = CooperativeFactory(is_active=False)
    assert api_client.post(f'{URL}/{coop.pk}/restore').status_code == 401
