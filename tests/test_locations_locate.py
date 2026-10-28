"""Finding the sector a point is in, from the official boundaries."""
import pytest

from locations import registry


@pytest.mark.parametrize('name, lat, lng, district', [
    ('Kigali Convention Centre', -1.9536, 30.0925, 'Gasabo'),
    ('Nyarugenge town', -1.9500, 30.0588, 'Nyarugenge'),
    ('Kicukiro centre', -1.9706, 30.1044, 'Kicukiro'),
    ('Musanze town', -1.4997, 29.6340, 'Musanze'),
    ('Huye town', -2.5967, 29.7394, 'Huye'),
    ('Rubavu, Gisenyi', -1.7030, 29.2600, 'Rubavu'),
    ('Nyagatare town', -1.2928, 30.3275, 'Nyagatare'),
    ('Rusizi, Cyangugu', -2.4846, 28.9075, 'Rusizi'),
    ('Rwamagana town', -1.9487, 30.4347, 'Rwamagana'),
])
def test_a_known_place_is_found_in_its_district(name, lat, lng, district):
    found = registry.locate(lat, lng)
    assert found is not None, name
    assert found['district']['name'] == district, name


def test_a_point_gives_the_whole_chain_down_to_the_sector_at_least():
    found = registry.locate(-1.9536, 30.0925)
    assert set(found) >= {'province', 'district', 'sector'}
    assert found['province']['name'] == 'Kigali City'
    in_district = {c['code'] for c in registry.children(found['district']['code'])}
    assert found['sector']['code'] in in_district
    assert found['district']['code'] in {c['code'] for c in registry.children(found['province']['code'])}


@pytest.mark.parametrize('name, lat, lng', [
    ('the middle of the sea', 0.0, 0.0),
    ('Kampala', 0.3476, 32.5825),
    ('Bukavu', -2.5083, 28.8608),
    ('Bujumbura', -3.3614, 29.3599),
    ('the south pole', -90.0, 0.0),
])
def test_a_point_outside_rwanda_gives_nothing(name, lat, lng):
    assert registry.locate(lat, lng) is None, name


@pytest.mark.parametrize('lat, lng', [
    (float('nan'), 30.0), (-1.9, float('inf')), (91.0, 30.0), (-1.9, 181.0), ('x', 30.0), (None, 30.0),
])
def test_a_point_that_cannot_be_true_is_a_value_error(lat, lng):
    with pytest.raises(ValueError):
        registry.locate(lat, lng)


def test_a_point_on_the_edge_of_a_sector_is_still_found():
    code = next(p['code'] for p in registry.walk() if p['level'] == 'sector')
    lng, lat = registry.outline(code)[0][0]
    assert registry.locate(lat, lng) is not None
