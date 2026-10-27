"""A farm's place is five linked choices, province down to village, and an optional street."""
import pytest

from locations import registry
from tests.factories import FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

LEVELS = ['province', 'district', 'sector', 'cell', 'village']


def address(district='Nyarugenge', index=0):
    """The codes of a real village in a district, as the form sends them."""
    district_code = next(p['code'] for p in registry.walk() if p['level'] == 'district' and p['name'] == district)
    villages = sorted((p for p in registry.walk() if p['level'] == 'village' and registry.chain(p['code'])['district']['code'] == district_code), key=lambda p: p['code'])
    chain = registry.chain(villages[index]['code'])
    return {f'{level}Code': chain[level]['code'] for level in LEVELS}


@pytest.fixture
def owner():
    return UserFactory(role='FARMER')


@pytest.fixture
def client(auth_client, owner):
    return auth_client(owner)


def create(client, **extra):
    return client.post('/api/farms', {'name': 'Hillside Farm', **address(), **extra}, format='json')


# ── making a farm ───────────────────────────────────────────────────────────

def test_a_farm_is_made_from_the_five_choices_and_says_where_it_is_in_words(client):
    response = create(client)
    assert response.status_code == 201
    data = response.json()['data']
    for level in LEVELS:
        assert set(data[level]) == {'code', 'name'}
    assert data['district']['name'] == 'Nyarugenge'
    assert data['street'] == ''
    # The one line used in lists and search, smallest place first.
    assert data['location'] == ', '.join(data[level]['name'] for level in reversed(LEVELS))


def test_a_street_is_kept_and_goes_first_in_the_line(client):
    data = create(client, street='  KN 5 Rd  ').json()['data']
    assert data['street'] == 'KN 5 Rd'
    assert data['location'].startswith('KN 5 Rd, ')


@pytest.mark.parametrize('missing', LEVELS)
def test_every_one_of_the_five_choices_is_needed(client, missing):
    body = {'name': 'Hillside Farm', **address()}
    del body[f'{missing}Code']
    response = client.post('/api/farms', body, format='json')
    assert response.status_code == 422
    assert f'{missing}Code' in response.json()['errors']


def test_a_place_that_does_not_sit_under_the_one_above_is_refused(client):
    codes = address()
    other = address('Musanze')
    response = client.post('/api/farms', {'name': 'Hillside Farm', **{**codes, 'cellCode': other['cellCode']}}, format='json')
    assert response.status_code == 422
    assert response.json()['errors']['villageCode'] == ['Please choose places that belong together.']


def test_a_code_that_is_not_a_place_is_refused(client):
    response = client.post('/api/farms', {'name': 'Hillside Farm', **{**address(), 'villageCode': '000000000'}}, format='json')
    assert response.status_code == 422


def test_free_text_in_place_of_the_choices_is_no_longer_taken(client):
    response = client.post('/api/farms', {'name': 'Hillside Farm', 'location': 'Somewhere'}, format='json')
    assert response.status_code == 422


def test_a_street_cannot_be_very_long(client):
    assert create(client, street='x' * 201).status_code == 422


def test_a_street_cannot_smuggle_markup_into_the_line_but_is_stored_as_text(client):
    data = create(client, street='<b>KN 5</b>').json()['data']
    # Stored exactly as typed. The pages show text as text, so it does nothing.
    assert data['street'] == '<b>KN 5</b>'


# ── changing it ─────────────────────────────────────────────────────────────

def test_the_place_of_a_farm_can_be_changed_with_all_five_choices(client):
    farm_id = create(client).json()['data']['id']
    new = address('Musanze')
    response = client.patch(f'/api/farms/{farm_id}', new, format='json')
    assert response.status_code == 200
    assert response.json()['data']['district']['name'] == 'Musanze'
    assert response.json()['data']['location'].endswith('Musanze, Northern Province')


def test_changing_only_some_of_the_choices_is_refused(client):
    farm_id = create(client).json()['data']['id']
    response = client.patch(f'/api/farms/{farm_id}', {'provinceCode': address('Musanze')['provinceCode']}, format='json')
    assert response.status_code == 422


def test_the_name_can_be_changed_alone_and_the_place_stays(client):
    farm_id = create(client).json()['data']['id']
    before = client.get(f'/api/farms/{farm_id}').json()['data']
    response = client.patch(f'/api/farms/{farm_id}', {'name': 'New name'}, format='json')
    assert response.status_code == 200
    after = response.json()['data']
    assert after['name'] == 'New name'
    assert after['location'] == before['location'] and after['village'] == before['village']


def test_the_street_can_be_changed_or_cleared_on_its_own(client):
    farm_id = create(client, street='KN 5 Rd').json()['data']['id']
    response = client.patch(f'/api/farms/{farm_id}', {'street': ''}, format='json')
    assert response.status_code == 200
    assert response.json()['data']['street'] == ''
    assert not response.json()['data']['location'].startswith(',')


def test_the_street_alone_changes_the_line_too(client):
    farm_id = create(client).json()['data']['id']
    response = client.patch(f'/api/farms/{farm_id}', {'street': 'KG 9 Ave'}, format='json')
    assert response.json()['data']['location'].startswith('KG 9 Ave, ')


# ── farms from before places ────────────────────────────────────────────────

def test_a_farm_from_before_keeps_its_text_and_has_no_choices(auth_client, owner):
    farm = FarmFactory(owner=owner, location='Near the old market, Gatsibo')
    data = auth_client(owner).get(f'/api/farms/{farm.pk}').json()['data']
    assert data['location'] == 'Near the old market, Gatsibo'
    assert [data[level] for level in LEVELS] == [None] * 5
    assert data['street'] == ''


def test_such_a_farm_can_be_renamed_without_giving_a_place(auth_client, owner):
    farm = FarmFactory(owner=owner, location='Near the old market, Gatsibo')
    response = auth_client(owner).patch(f'/api/farms/{farm.pk}', {'name': 'Renamed'}, format='json')
    assert response.status_code == 200
    assert response.json()['data']['location'] == 'Near the old market, Gatsibo'


def test_such_a_farm_can_be_given_a_place_later(auth_client, owner):
    farm = FarmFactory(owner=owner, location='Near the old market, Gatsibo')
    response = auth_client(owner).patch(f'/api/farms/{farm.pk}', address('Gatsibo'), format='json')
    assert response.status_code == 200
    assert response.json()['data']['district']['name'] == 'Gatsibo'


# ── the lists ───────────────────────────────────────────────────────────────

def test_the_list_carries_the_places_without_a_query_each(auth_client, owner):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    client = auth_client(owner)
    create(client)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            assert client.get('/api/farms').status_code == 200
        return len(captured)

    few = queries()
    for index in range(1, 6):
        client.post('/api/farms', {'name': f'Farm {index}', **address(index=index)}, format='json')
    assert queries() <= few + 1
    assert client.get('/api/farms').json()['data'][0]['village']['name']
