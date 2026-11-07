"""An invitation can carry the amount a new farmer may take, and the team list shows each farmer's allowance."""
import pytest
from rest_framework.test import APIClient

from cooperatives.models import CooperativeInvitation
from supply import allowance
from supply.models import Allowance, AllowanceChange, SupplySettings
from tests.factories import CooperativeFactory, UserFactory

pytestmark = pytest.mark.django_db

STRONG = 'Zebra-Quartz-84'
INVITATIONS = '/api/team/invitations'
FARMERS = '/api/team/farmers'


@pytest.fixture
def coop():
    return CooperativeFactory(name='Gatsibo Silk')


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')


@pytest.fixture
def sup_client(auth_client, supervisor):
    return auth_client(supervisor)


def invite(client, **body):
    return client.post(INVITATIONS, body, format='json')


def token_of(response):
    return response.json()['data']['link'].rsplit('/', 1)[1]


def register(token, email='aline@example.rw'):
    body = {'name': 'Aline Uwase', 'email': email, 'password': STRONG, 'invitation': token}
    return APIClient().post('/api/auth/register', body, format='json')


# ── what the invitation says ──────────────────────────────────────────────────

def test_an_invitation_with_a_starter_amount_gives_that_allowance_when_it_is_used(sup_client, supervisor, coop):
    response = invite(sup_client, starterBoxes=3)
    assert response.status_code == 201
    assert response.json()['data']['starterBoxes'] == 3
    assert register(token_of(response)).status_code == 201
    row = Allowance.objects.get()
    assert (row.boxes, row.cooperative_id) == (3, coop.pk)
    change = AllowanceChange.objects.get()
    assert (change.kind, change.new_boxes, change.decided_by_id) == ('start', 3, supervisor.pk)


def test_without_an_amount_the_cooperative_default_is_used_and_later_edits_do_not_move_it(sup_client, coop):
    SupplySettings.objects.create(cooperative=coop, starter_boxes=4)
    token = token_of(invite(sup_client))
    assert CooperativeInvitation.objects.get().starter_boxes is None
    register(token)
    SupplySettings.objects.filter(cooperative=coop).update(starter_boxes=1)
    assert Allowance.objects.get().boxes == 4


@pytest.mark.parametrize('value', [101, -1, 2.5, 'x', True])
def test_a_starter_amount_that_is_not_a_whole_number_from_0_to_100_is_refused(sup_client, value):
    response = invite(sup_client, starterBoxes=value)
    assert response.status_code == 422
    assert response.json()['code'] == 'bad_boxes'
    assert CooperativeInvitation.objects.count() == 0


def test_zero_is_a_valid_starter_amount(sup_client):
    register(token_of(invite(sup_client, starterBoxes=0)))
    assert Allowance.objects.get().boxes == 0


def test_the_invitation_list_shows_the_amount_it_carries(sup_client):
    invite(sup_client, starterBoxes=3)
    invite(sup_client)
    rows = sup_client.get(INVITATIONS).json()['data']
    assert sorted(r['starterBoxes'] for r in rows if r['starterBoxes'] is not None) == [3]
    assert [r['starterBoxes'] for r in rows].count(None) == 1


def test_a_signed_in_farmer_using_the_link_gets_the_amount_too(auth_client, sup_client, coop):
    token = token_of(invite(sup_client, starterBoxes=5))
    farmer = UserFactory(role='FARMER', cooperative=None)
    assert auth_client(farmer).post(f'/api/invitations/{token}/accept').status_code == 200
    assert allowance.current(farmer) == {'boxes': 5, 'source': 'set', 'since': Allowance.objects.get().since}


def test_a_farmer_removed_from_one_cooperative_and_invited_to_another_does_not_keep_the_old_amount(auth_client, sup_client, coop):
    farmer = UserFactory(role='FARMER', cooperative=coop)
    allowance.set_start(farmer, coop, 9, by=None)
    assert sup_client.delete(f'{FARMERS}/{farmer.pk}').status_code == 200
    other_coop = CooperativeFactory()
    other_supervisor = UserFactory(role='SUPERVISOR', cooperative=other_coop)
    token = token_of(invite(auth_client(other_supervisor), starterBoxes=2))
    assert auth_client(farmer).post(f'/api/invitations/{token}/accept').status_code == 200
    assert allowance.current(farmer)['boxes'] == 2
    assert Allowance.objects.get().cooperative_id == other_coop.pk


# ── the team list ─────────────────────────────────────────────────────────────

def test_the_team_list_shows_each_farmers_allowance_and_where_it_comes_from(sup_client, coop):
    SupplySettings.objects.create(cooperative=coop, starter_boxes=2)
    early = UserFactory(role='FARMER', cooperative=coop, name='Early Farmer')
    set_one = UserFactory(role='FARMER', cooperative=coop, name='Set Farmer')
    allowance.set_start(set_one, coop, 6, by=None)
    rows = {r['name']: r['allowance'] for r in sup_client.get(FARMERS).json()['data']}
    assert rows == {early.name: {'boxes': 2, 'source': 'default'}, set_one.name: {'boxes': 6, 'source': 'set'}}
