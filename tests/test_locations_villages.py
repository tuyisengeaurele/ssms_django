"""A point on the map gives its cell and village too, from the village outlines, and only when the data is sure."""
import pytest

from locations import registry

pytestmark = pytest.mark.django_db


def entries():
    """Every village outline in the data: (sector code, village code or '', cell code, rings)."""
    for sector, rows in registry._village_outlines().items():
        for _, _, _, _, village, cell, rings in rows:
            yield sector, village, cell, rings


def interior_point(rings):
    """A point that is certainly inside the first ring, as (longitude, latitude)."""
    ring = rings[0]
    for i in range(len(ring) - 3):
        x = sum(p[0] for p in ring[i:i + 3]) / 3
        y = sum(p[1] for p in ring[i:i + 3]) / 3
        if registry._inside(x, y, rings):
            return x, y
    raise AssertionError('No interior point found.')


def a_village_with_a_code():
    return next(e for e in entries() if e[1])


# ── what the data holds ─────────────────────────────────────────────────────

def test_every_outline_names_a_real_cell_inside_the_sector_it_is_filed_under():
    for sector, village, cell, _ in entries():
        assert registry.chain(cell)['sector']['code'] == sector, (sector, cell)


def test_every_outline_with_a_village_names_a_real_village_of_its_cell():
    for _, village, cell, _ in entries():
        if village:
            found = registry.chain(village)
            assert found['village']['code'] == village and found['cell']['code'] == cell, village


def test_a_village_has_at_most_one_outline():
    codes = [village for _, village, _, _ in entries() if village]
    assert len(codes) == len(set(codes))


def test_nearly_every_village_of_the_register_has_an_outline():
    have = {village for _, village, _, _ in entries() if village}
    villages = sum(1 for p in registry.walk() if p['level'] == 'village')
    assert len(have) / villages > 0.97


def test_every_outline_is_a_closed_ring_of_longitude_and_latitude_inside_rwanda():
    west, south, east, north = registry.BOX
    for _, _, _, rings in entries():
        for ring in rings:
            assert ring[0] == ring[-1] and len(ring) >= 4
            assert all(west <= x <= east and south <= y <= north for x, y in ring)


# ── finding the village ─────────────────────────────────────────────────────

def test_a_point_inside_a_village_gives_its_cell_and_village_with_the_whole_chain():
    sector, village, cell, rings = a_village_with_a_code()
    x, y = interior_point(rings)
    found = registry.locate(y, x)
    assert found['village']['code'] == village
    assert found['cell']['code'] == cell
    assert found['sector']['code'] == sector
    assert registry.chain(village)['district']['code'] == found['district']['code']
    assert registry.chain(village)['province']['code'] == found['province']['code']


def test_the_names_come_with_the_codes():
    _, village, cell, rings = a_village_with_a_code()
    x, y = interior_point(rings)
    found = registry.locate(y, x)
    assert found['village']['name'] == registry.chain(village)['village']['name']
    assert found['cell']['name'] == registry.chain(cell)['cell']['name']


def test_a_known_place_in_kigali_is_found_down_to_its_village():
    found = registry.locate(-1.9536, 30.0925)
    assert found['district']['name'] == 'Gasabo'
    assert 'village' in found and 'cell' in found


def test_a_sector_with_no_village_outline_still_gives_the_sector(monkeypatch):
    monkeypatch.setattr(registry, '_village_outlines', lambda: {})
    found = registry.locate(-1.9536, 30.0925)
    assert set(found) == {'province', 'district', 'sector'}


def test_an_outline_that_only_knows_its_cell_gives_the_cell_and_no_village(monkeypatch):
    sector, village, cell, rings = a_village_with_a_code()
    xs = [x for x, _ in rings[0]]
    ys = [y for _, y in rings[0]]
    monkeypatch.setattr(registry, '_village_outlines', lambda: {sector: [(min(xs), min(ys), max(xs), max(ys), '', cell, rings)]})
    x, y = interior_point(rings)
    found = registry.locate(y, x)
    assert found['cell']['code'] == cell
    assert 'village' not in found


def test_a_point_in_a_sector_but_in_no_outline_gives_the_sector_only(monkeypatch):
    sector, village, cell, rings = a_village_with_a_code()
    x, y = interior_point(rings)
    monkeypatch.setattr(registry, '_village_outlines', lambda: {sector: []})
    assert set(registry.locate(y, x)) == {'province', 'district', 'sector'}


# ── the answer of the API ───────────────────────────────────────────────────

def test_the_api_returns_the_cell_and_the_village(auth_client):
    from tests.factories import UserFactory
    _, village, cell, rings = a_village_with_a_code()
    x, y = interior_point(rings)
    response = auth_client(UserFactory(role='FARMER')).post('/api/locations/locate', {'lat': y, 'lng': x}, format='json')
    assert response.status_code == 200
    data = response.json()['data']
    assert data['village']['code'] == village and data['cell']['code'] == cell
