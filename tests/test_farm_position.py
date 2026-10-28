"""A farm keeps the exact spot it stands on, saved from "Use my location", so a map can show it."""
import pytest

from audit_log.models import AuditLog
from locations import registry
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

LEVELS = ['province', 'district', 'sector', 'cell', 'village']


def interior_point(rings):
    """A point certainly inside the first ring, as (longitude, latitude)."""
    ring = rings[0]
    for i in range(len(ring) - 3):
        x = sum(p[0] for p in ring[i:i + 3]) / 3
        y = sum(p[1] for p in ring[i:i + 3]) / 3
        if registry._inside(x, y, rings):
            return x, y
    raise AssertionError('No interior point found.')


def places():
    """Villages that have an outline, one for each of three different sectors: (codes as the form sends them, lat, lng)."""
    seen, found = set(), []
    for sector, rows in registry._village_outlines().items():
        for _, _, _, _, village, _, rings in rows:
            if village and sector not in seen:
                seen.add(sector)
                chain = registry.chain(village)
                x, y = interior_point(rings)
                found.append(({f'{level}Code': chain[level]['code'] for level in LEVELS}, y, x))
                break
        if len(found) == 3:
            return found
    raise AssertionError('Not enough villages with outlines.')


HOME, ELSEWHERE, FAR = places()
SEA = (0.0, 0.0)


@pytest.fixture
def owner():
    return UserFactory(role='FARMER', cooperative=CooperativeFactory(), name='Mugisha Serge')


@pytest.fixture
def client(auth_client, owner):
    return auth_client(owner)


def create(client, place=HOME, **extra):
    codes, lat, lng = place
    body = {'name': 'Hillside Farm', **codes, **extra}
    return client.post('/api/farms', body, format='json')


def with_point(place=HOME):
    return {'latitude': place[1], 'longitude': place[2]}


def a_farm(client, place=HOME, point=True):
    response = create(client, place, **(with_point(place) if point else {}))
    assert response.status_code == 201, response.content[:300]
    return response.json()['data']


# ── saving a position ───────────────────────────────────────────────────────

def test_a_farm_is_made_with_the_spot_it_stands_on(client):
    data = a_farm(client)
    assert data['latitude'] == pytest.approx(HOME[1], abs=1e-5)
    assert data['longitude'] == pytest.approx(HOME[2], abs=1e-5)


def test_the_position_is_rounded_to_about_a_metre(client):
    created = create(client, **{'latitude': HOME[1] + 0.000001234, 'longitude': HOME[2] + 0.000004321}).json()['data']
    assert created['latitude'] == round(HOME[1] + 0.000001234, 5)
    assert created['longitude'] == round(HOME[2] + 0.000004321, 5)


def test_a_farm_without_a_position_has_none(client):
    data = a_farm(client, point=False)
    assert data['latitude'] is None and data['longitude'] is None


def test_explicit_nulls_mean_no_position(client):
    data = create(client, latitude=None, longitude=None).json()['data']
    assert data['latitude'] is None and data['longitude'] is None


def test_the_position_is_kept_on_the_farm_and_comes_back_in_the_detail_and_the_list(client):
    farm = a_farm(client)
    detail = client.get(f'/api/farms/{farm["id"]}').json()['data']
    listed = client.get('/api/farms').json()['data'][0]
    assert detail['latitude'] == farm['latitude'] and listed['longitude'] == farm['longitude']


# ── refusing a position that cannot be right ────────────────────────────────

def test_a_latitude_without_a_longitude_is_refused(client):
    response = create(client, latitude=HOME[1])
    assert response.status_code == 422
    assert response.json()['errors']['latitude'] == ['Please send both a latitude and a longitude.']


def test_a_longitude_without_a_latitude_is_refused(client):
    assert create(client, longitude=HOME[2]).status_code == 422


@pytest.mark.parametrize('lat, lng', [('nan', 30.0), (-1.9, 'inf'), (91.0, 30.0), (-1.9, 181.0)])
def test_a_position_that_cannot_be_true_is_refused(client, lat, lng):
    response = create(client, latitude=lat, longitude=lng)
    assert response.status_code == 422
    messages = [m for found in response.json()['errors'].values() for m in found]
    assert messages == ['Please send a valid latitude and a longitude.']


@pytest.mark.parametrize('lat, lng', [('here', 'there'), ([], {})])
def test_a_position_that_is_not_numbers_is_refused(client, lat, lng):
    response = create(client, latitude=lat, longitude=lng)
    assert response.status_code == 422
    assert 'Please send a valid latitude and a longitude.' in [m for found in response.json()['errors'].values() for m in found]


@pytest.mark.parametrize('name, lat, lng', [('the sea', 0.0, 0.0), ('Kampala', 0.3476, 32.5825), ('Bukavu', -2.5083, 28.8608)])
def test_a_position_outside_rwanda_is_refused(client, name, lat, lng):
    response = create(client, latitude=lat, longitude=lng)
    assert response.status_code == 422, name
    assert response.json()['errors']['latitude'] == ['That position is not inside Rwanda.']


def test_a_position_in_another_sector_than_the_one_chosen_is_refused(client):
    response = create(client, HOME, latitude=ELSEWHERE[1], longitude=ELSEWHERE[2])
    assert response.status_code == 422
    assert response.json()['errors']['latitude'] == ['That position is not inside the sector you chose.']


def test_a_refused_farm_is_not_saved(client):
    create(client, latitude=0.0, longitude=0.0)
    assert client.get('/api/farms').json()['data'] == []


# ── changing it later ───────────────────────────────────────────────────────

def test_a_position_can_be_added_to_a_farm_that_has_none(client):
    farm = a_farm(client, point=False)
    response = client.patch(f'/api/farms/{farm["id"]}', with_point(), format='json')
    assert response.status_code == 200
    assert response.json()['data']['latitude'] == pytest.approx(HOME[1], abs=1e-5)


def test_a_new_position_outside_the_farms_sector_is_refused(client):
    farm = a_farm(client)
    response = client.patch(f'/api/farms/{farm["id"]}', {'latitude': ELSEWHERE[1], 'longitude': ELSEWHERE[2]}, format='json')
    assert response.status_code == 422
    assert client.get(f'/api/farms/{farm["id"]}').json()['data']['latitude'] == farm['latitude']


def test_the_position_can_be_removed(client):
    farm = a_farm(client)
    response = client.patch(f'/api/farms/{farm["id"]}', {'latitude': None, 'longitude': None}, format='json')
    assert response.status_code == 200
    data = client.get(f'/api/farms/{farm["id"]}').json()['data']
    assert data['latitude'] is None and data['longitude'] is None


def test_renaming_a_farm_keeps_its_position(client):
    farm = a_farm(client)
    client.patch(f'/api/farms/{farm["id"]}', {'name': 'Hilltop Farm'}, format='json')
    assert client.get(f'/api/farms/{farm["id"]}').json()['data']['latitude'] == farm['latitude']


def test_changing_only_the_street_keeps_the_position(client):
    farm = a_farm(client)
    client.patch(f'/api/farms/{farm["id"]}', {'street': 'Near the church'}, format='json')
    assert client.get(f'/api/farms/{farm["id"]}').json()['data']['latitude'] == farm['latitude']


def test_saving_the_same_place_again_without_a_position_keeps_the_old_one(client):
    farm = a_farm(client)
    client.patch(f'/api/farms/{farm["id"]}', {'name': 'Same place', **HOME[0]}, format='json')
    assert client.get(f'/api/farms/{farm["id"]}').json()['data']['latitude'] == farm['latitude']


def test_moving_the_farm_to_another_sector_without_a_new_position_clears_the_old_one(client):
    farm = a_farm(client)
    client.patch(f'/api/farms/{farm["id"]}', {**ELSEWHERE[0]}, format='json')
    data = client.get(f'/api/farms/{farm["id"]}').json()['data']
    assert data['latitude'] is None and data['longitude'] is None


def test_moving_the_farm_with_a_position_in_the_new_sector_keeps_it(client):
    farm = a_farm(client)
    response = client.patch(f'/api/farms/{farm["id"]}', {**ELSEWHERE[0], **with_point(ELSEWHERE)}, format='json')
    assert response.status_code == 200
    assert response.json()['data']['latitude'] == pytest.approx(ELSEWHERE[1], abs=1e-5)


def test_moving_the_farm_with_a_position_in_the_old_sector_is_refused(client):
    farm = a_farm(client)
    response = client.patch(f'/api/farms/{farm["id"]}', {**ELSEWHERE[0], **with_point(HOME)}, format='json')
    assert response.status_code == 422


def test_a_farm_from_before_places_takes_a_position_inside_rwanda(client, owner):
    old = FarmFactory(owner=owner, location='Near the old market')
    response = client.patch(f'/api/farms/{old.pk}', with_point(), format='json')
    assert response.status_code == 200
    assert client.patch(f'/api/farms/{old.pk}', {'latitude': 0.0, 'longitude': 0.0}, format='json').status_code == 422


# ── who sees it, who may set it ─────────────────────────────────────────────

def test_a_supervisor_of_the_cooperative_and_an_admin_see_the_position(auth_client, client, owner):
    farm = a_farm(client)
    supervisor = UserFactory(role='SUPERVISOR', cooperative=owner.cooperative)
    for person in (supervisor, UserFactory(role='ADMIN')):
        seen = auth_client(person).get(f'/api/farms/{farm["id"]}').json()['data']
        assert seen['latitude'] == farm['latitude'] and seen['longitude'] == farm['longitude']


def test_a_supervisor_cannot_change_it(auth_client, client, owner):
    farm = a_farm(client, point=False)
    supervisor = UserFactory(role='SUPERVISOR', cooperative=owner.cooperative)
    assert auth_client(supervisor).patch(f'/api/farms/{farm["id"]}', with_point(), format='json').status_code == 403


def test_a_farmer_of_another_cooperative_cannot_see_or_change_it(auth_client, client):
    farm = a_farm(client)
    stranger = auth_client(UserFactory(role='FARMER', cooperative=CooperativeFactory()))
    assert stranger.get(f'/api/farms/{farm["id"]}').status_code == 404
    assert stranger.patch(f'/api/farms/{farm["id"]}', {'latitude': None, 'longitude': None}, format='json').status_code == 404


def test_the_audit_log_never_holds_the_coordinates(client):
    farm = a_farm(client)
    client.patch(f'/api/farms/{farm["id"]}', {'latitude': None, 'longitude': None}, format='json')
    for entry in AuditLog.objects.all():
        assert str(round(HOME[1], 2)) not in entry.detail and str(round(HOME[2], 2)) not in entry.detail
