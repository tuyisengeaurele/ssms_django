"""A farmer who opens their cooperative's page sees who is in it, but not anyone's email address.

The staff and the SSMS team need the address, a farmer does not: it is the login of the other person. The number rules are
in tests/test_phone_visibility.py and must not change here.
"""
import pytest

from tests.factories import CooperativeFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def world():
    coop = CooperativeFactory()
    return {
        'coop': coop,
        'admin': UserFactory(role='ADMIN'),
        'supervisor': UserFactory(role='SUPERVISOR', cooperative=coop, email='claire@example.rw', phone='+250722000111'),
        'farmer': UserFactory(cooperative=coop, email='aline@example.rw', phone='+250788000001'),
        'other': UserFactory(cooperative=coop, email='bruce@example.rw', phone='+250788000002'),
    }


def members(auth_client, world, who):
    response = auth_client(world[who]).get(f"/api/cooperatives/{world['coop'].pk}")
    assert response.status_code == 200, response.content
    return {m['id']: m for m in response.json()['data']['members']}


def test_a_farmer_gets_each_members_name_and_role_and_no_email(auth_client, world):
    seen = members(auth_client, world, 'farmer')
    assert set(seen) == {world['supervisor'].pk, world['farmer'].pk, world['other'].pk}
    for member in seen.values():
        assert 'email' not in member
        assert member['name'] and member['role']
    text = str(seen)
    assert '@example.rw' not in text


def test_a_farmer_gets_no_email_key_even_for_themselves_or_their_supervisor(auth_client, world):
    seen = members(auth_client, world, 'farmer')
    assert 'email' not in seen[world['farmer'].pk]
    assert 'email' not in seen[world['supervisor'].pk]


def test_a_supervisor_and_an_admin_still_get_the_email(auth_client, world):
    for who in ('supervisor', 'admin'):
        seen = members(auth_client, world, who)
        assert seen[world['other'].pk]['email'] == 'bruce@example.rw', who
        assert seen[world['farmer'].pk]['email'] == 'aline@example.rw', who


def test_a_farmer_still_gets_their_supervisors_number_and_their_own_and_nobody_elses(auth_client, world):
    seen = members(auth_client, world, 'farmer')
    assert seen[world['supervisor'].pk]['phone'] == '+250722000111'
    assert seen[world['farmer'].pk]['phone'] == '+250788000001'
    assert 'phone' not in seen[world['other'].pk]
