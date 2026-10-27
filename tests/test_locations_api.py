"""The place lists and the "use my location" lookup the farm form needs."""
import pytest

from locations import registry
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def client(auth_client):
    return auth_client(UserFactory(role='FARMER'))


def test_without_a_parent_the_provinces_come_back(client):
    response = client.get('/api/locations')
    assert response.status_code == 200
    rows = response.json()['data']
    assert [r['name'] for r in rows] == sorted((r['name'] for r in rows), key=str.casefold)
    assert {r['name'] for r in rows} == {'Kigali City', 'Southern Province', 'Western Province', 'Northern Province', 'Eastern Province'}
    assert set(rows[0]) == {'code', 'name'}


def test_a_parent_gives_the_places_directly_under_it(client):
    province = next(c for c in registry.children(None) if c['name'] == 'Kigali City')
    rows = client.get(f"/api/locations?parent={province['code']}").json()['data']
    assert {r['name'] for r in rows} == {'Gasabo', 'Kicukiro', 'Nyarugenge'}


def test_every_level_can_be_walked_down(client):
    code = None
    for _ in range(5):
        rows = client.get('/api/locations' + (f'?parent={code}' if code else '')).json()['data']
        assert rows
        code = rows[0]['code']
    assert client.get(f'/api/locations?parent={code}').json()['data'] == []


def test_an_unknown_parent_is_not_found_in_plain_words(client):
    response = client.get('/api/locations?parent=999')
    assert response.status_code == 404
    assert response.json()['message'] == "We couldn't find that place."


def test_a_parent_that_is_not_a_code_is_not_found_either(client):
    assert client.get('/api/locations?parent=../../etc').status_code == 404


def test_the_lists_need_a_signed_in_person(api_client):
    assert api_client.get('/api/locations').status_code == 401
    assert api_client.post('/api/locations/locate', {'lat': -1.95, 'lng': 30.09}, format='json').status_code == 401


def test_a_point_in_kigali_gives_province_district_and_sector(client):
    response = client.post('/api/locations/locate', {'lat': -1.9536, 'lng': 30.0925}, format='json')
    assert response.status_code == 200
    data = response.json()['data']
    assert data['province']['name'] == 'Kigali City'
    assert data['district']['name'] == 'Gasabo'
    assert set(data['sector']) == {'code', 'name'}


def test_a_point_outside_rwanda_says_so_in_plain_words(client):
    response = client.post('/api/locations/locate', {'lat': 0.3476, 'lng': 32.5825}, format='json')
    assert response.status_code == 404
    assert response.json()['message'] == "That spot is not inside a Rwanda sector."


@pytest.mark.parametrize('body', [
    {}, {'lat': -1.9}, {'lng': 30.0}, {'lat': 'x', 'lng': 30}, {'lat': 'nan', 'lng': 30}, {'lat': -1.9, 'lng': 'inf'},
    {'lat': 95, 'lng': 30}, {'lat': None, 'lng': 30}, {'lat': [1], 'lng': 30},
])
def test_a_missing_or_impossible_point_is_refused_in_plain_words(client, body):
    response = client.post('/api/locations/locate', body, format='json')
    assert response.status_code == 422
    assert response.json()['message'] == 'Please send a valid latitude and longitude.'


def test_the_point_is_not_taken_from_the_address(client):
    assert client.get('/api/locations/locate?lat=-1.9536&lng=30.0925').status_code == 405
    assert client.post('/api/locations/locate?lat=-1.9536&lng=30.0925', {}, format='json').status_code == 422
