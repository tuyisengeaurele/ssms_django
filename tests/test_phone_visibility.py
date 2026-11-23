"""Who sees whose phone number.

The person sees their own. The SSMS team sees every number. A supervisor sees the farmers who are in their cooperative now. A
farmer sees the supervisor of their cooperative and never another farmer. Everyone else sees nothing, and the `phone` key is
left out of an answer when the viewer may not have it (it is not sent as null, so the page cannot tell there is one).
"""
import pytest

from tests.factories import CooperativeFactory, FarmFactory, UserFactory
from users.phone_visibility import can_see_phone, visible_phone_ids

pytestmark = pytest.mark.django_db

NUMBERS = {
    'admin': '+250788000010', 'sup_a': '+250788000011', 'sup_b': '+250788000012', 'farmer_a': '+250788000013',
    'farmer_a2': '+250788000014', 'farmer_b': '+250788000015', 'gone': '+250788000016', 'loner': '+250788000017',
}


@pytest.fixture
def world():
    from users.models import User
    coop_a, coop_b = CooperativeFactory(), CooperativeFactory()
    people = {
        'admin': UserFactory(role='ADMIN', phone=NUMBERS['admin']),
        'sup_a': UserFactory(role='SUPERVISOR', cooperative=coop_a, phone=NUMBERS['sup_a']),
        'sup_b': UserFactory(role='SUPERVISOR', cooperative=coop_b, phone=NUMBERS['sup_b']),
        'farmer_a': UserFactory(cooperative=coop_a, phone=NUMBERS['farmer_a']),
        'farmer_a2': UserFactory(cooperative=coop_a, phone=NUMBERS['farmer_a2']),
        'farmer_b': UserFactory(cooperative=coop_b, phone=NUMBERS['farmer_b']),
        'gone': UserFactory(cooperative=coop_a, phone=NUMBERS['gone']),
        'loner': UserFactory(phone=NUMBERS['loner']),
    }
    # One farmer leaves the cooperative: the membership closes, and the old supervisor loses sight of the number.
    gone = people['gone']
    gone.cooperative = None
    gone.save()
    people['coop_a'], people['coop_b'] = coop_a, coop_b
    return {**people, 'User': User}


# ── the rule ─────────────────────────────────────────────────────────────────────────────────

CASES = [
    # (viewer, target, may see)
    ('admin', 'sup_a', True), ('admin', 'farmer_b', True), ('admin', 'loner', True),
    ('farmer_a', 'farmer_a', True), ('sup_a', 'sup_a', True),
    ('sup_a', 'farmer_a', True), ('sup_a', 'farmer_a2', True),
    ('sup_a', 'farmer_b', False), ('sup_a', 'gone', False), ('sup_a', 'loner', False),
    ('sup_a', 'sup_b', False), ('sup_a', 'admin', False),
    ('farmer_a', 'sup_a', True),
    ('farmer_a', 'farmer_a2', False), ('farmer_a', 'sup_b', False), ('farmer_a', 'farmer_b', False), ('farmer_a', 'admin', False),
    ('loner', 'sup_a', False), ('loner', 'farmer_a', False),
    ('gone', 'sup_a', False),
]


@pytest.mark.parametrize('viewer,target,expected', CASES)
def test_who_may_see_whose_number(world, viewer, target, expected):
    assert can_see_phone(world[viewer], world[target]) is expected


def test_a_whole_list_is_answered_in_one_query(world, django_assert_num_queries):
    ids = [world[k].pk for k in ('sup_a', 'farmer_a', 'farmer_a2', 'farmer_b', 'gone')]
    with django_assert_num_queries(1):
        seen = visible_phone_ids(world['sup_a'], ids)
    # The supervisor's own number is theirs to see too.
    assert seen == {world['sup_a'].pk, world['farmer_a'].pk, world['farmer_a2'].pk}


def test_an_admin_and_a_list_of_only_yourself_need_no_query(world, django_assert_num_queries):
    with django_assert_num_queries(0):
        assert visible_phone_ids(world['admin'], ['x', 'y']) == {'x', 'y'}
        assert visible_phone_ids(world['farmer_a'], [world['farmer_a'].pk]) == {world['farmer_a'].pk}


# ── the lists ────────────────────────────────────────────────────────────────────────────────

def phones_in(rows, key='phone'):
    return {row.get(key) for row in rows if key in row}


def test_the_team_list_of_farmers_carries_numbers_for_the_supervisor_and_the_team(auth_client, world):
    for viewer, url in (('sup_a', '/api/team/farmers'), ('admin', f"/api/team/farmers?cooperativeId={world['coop_a'].pk}")):
        rows = auth_client(world[viewer]).get(url).json()['data']
        assert phones_in(rows) == {NUMBERS['farmer_a'], NUMBERS['farmer_a2']}, viewer
        assert all('phone' in row for row in rows)


def test_a_farmer_cannot_open_the_team_list(auth_client, world):
    assert auth_client(world['farmer_a']).get('/api/team/farmers').status_code == 403


def test_the_cooperative_page_shows_each_viewer_only_what_they_may_see(auth_client, world):
    url = f"/api/cooperatives/{world['coop_a'].pk}"
    seen = {}
    for viewer in ('admin', 'sup_a', 'farmer_a'):
        members = auth_client(world[viewer]).get(url).json()['data']['members']
        seen[viewer] = {m['id']: m.get('phone') for m in members}
    a, a2, sup = world['farmer_a'].pk, world['farmer_a2'].pk, world['sup_a'].pk
    assert seen['admin'] == {a: NUMBERS['farmer_a'], a2: NUMBERS['farmer_a2'], sup: NUMBERS['sup_a']}
    assert seen['sup_a'] == {a: NUMBERS['farmer_a'], a2: NUMBERS['farmer_a2'], sup: NUMBERS['sup_a']}
    assert seen['farmer_a'] == {a: NUMBERS['farmer_a'], a2: None, sup: NUMBERS['sup_a']}


def test_a_farmer_gets_no_phone_key_at_all_for_another_farmer(auth_client, world):
    members = auth_client(world['farmer_a']).get(f"/api/cooperatives/{world['coop_a'].pk}").json()['data']['members']
    other = next(m for m in members if m['id'] == world['farmer_a2'].pk)
    assert 'phone' not in other
    assert NUMBERS['farmer_a2'].replace('+250', '') not in str(members)


def test_a_waiting_room_shows_its_owners_number_to_the_supervisor_only_in_scope(auth_client, world):
    farm = FarmFactory(owner=world['farmer_a'])
    assert auth_client(world['farmer_a']).post(f'/api/farms/{farm.pk}/rooms', {'name': 'Room A', 'areaM2': 12}, format='json').status_code == 201
    rooms = auth_client(world['sup_a']).get('/api/team/rooms').json()['data']['rooms']
    assert [r['owner'].get('phone') for r in rooms] == [NUMBERS['farmer_a']]
    assert auth_client(world['sup_b']).get('/api/team/rooms').json()['data']['rooms'] == []


def test_an_allowance_request_shows_the_farmers_number_to_the_supervisor(auth_client, world):
    asked = auth_client(world['farmer_a']).post('/api/supply/allowance/requests', {'boxesAsked': 4, 'reason': 'A second house'}, format='json')
    assert asked.status_code == 201, asked.content
    rows = auth_client(world['sup_a']).get('/api/supply/allowance/requests').json()['data']['requests']
    assert [r['farmer'].get('phone') for r in rows] == [NUMBERS['farmer_a']]
    detail = auth_client(world['sup_a']).get(f"/api/supply/allowance/farmers/{world['farmer_a'].pk}").json()['data']
    assert detail['farmer']['phone'] == NUMBERS['farmer_a']
    admin_rows = auth_client(world['admin']).get('/api/supply/allowance/requests').json()['data']['requests']
    assert [r['farmer'].get('phone') for r in admin_rows] == [NUMBERS['farmer_a']]


# ── the farmer's own answer ──────────────────────────────────────────────────────────────────

def test_a_farmer_sees_their_supervisor_in_their_own_account(auth_client, world):
    me = auth_client(world['farmer_a']).get('/api/auth/me').json()['data']
    assert me['supervisor'] == {'id': world['sup_a'].pk, 'name': world['sup_a'].name, 'phone': NUMBERS['sup_a']}


def test_a_farmer_with_no_supervisor_in_the_cooperative_gets_null(auth_client):
    coop = CooperativeFactory()
    farmer = UserFactory(cooperative=coop)
    assert auth_client(farmer).get('/api/auth/me').json()['data']['supervisor'] is None


def test_a_farmer_in_no_cooperative_gets_null(auth_client, world):
    assert auth_client(world['loner']).get('/api/auth/me').json()['data']['supervisor'] is None


def test_a_deactivated_supervisor_is_not_shown(auth_client, world):
    world['sup_a'].is_active = False
    world['sup_a'].save()
    assert auth_client(world['farmer_a']).get('/api/auth/me').json()['data']['supervisor'] is None


@pytest.mark.parametrize('who', ['sup_a', 'admin'])
def test_a_supervisor_or_admin_has_no_supervisor_block(auth_client, world, who):
    assert auth_client(world[who]).get('/api/auth/me').json()['data']['supervisor'] is None
