"""The middle of a village or a sector, for putting a farm on the map when it has no exact position."""
import pytest

from locations import registry

pytestmark = pytest.mark.django_db


def a_village_with_an_outline():
    for sector, rows in registry._village_outlines().items():
        for _, _, _, _, village, _, rings in rows:
            if village:
                return sector, village, rings
    raise AssertionError('No village has an outline.')


def inside(point, rings):
    return registry._inside(point['lng'], point['lat'], rings)


# ── the middle of any outline ───────────────────────────────────────────────

SQUARE = [[[30.0, -2.0], [30.1, -2.0], [30.1, -1.9], [30.0, -1.9], [30.0, -2.0]]]


def test_the_middle_of_a_square_is_its_middle():
    x, y = registry.centre_of(SQUARE)
    assert (round(x, 5), round(y, 5)) == (30.05, -1.95)


def test_a_bent_shape_whose_middle_lies_outside_still_gives_a_point_inside():
    # An L: the plain average of the corners falls in the notch, outside the shape.
    ell = [[[30.0, -2.0], [30.3, -2.0], [30.3, -1.9], [30.1, -1.9], [30.1, -1.6], [30.0, -1.6], [30.0, -2.0]]]
    x, y = registry.centre_of(ell)
    assert registry._inside(x, y, ell)


def test_a_point_is_never_put_inside_a_hole():
    ring_with_hole = [
        [[30.0, -2.0], [30.4, -2.0], [30.4, -1.6], [30.0, -1.6], [30.0, -2.0]],
        [[30.15, -1.85], [30.25, -1.85], [30.25, -1.75], [30.15, -1.75], [30.15, -1.85]],
    ]
    x, y = registry.centre_of(ring_with_hole)
    assert registry._inside(x, y, ring_with_hole)


def test_two_separate_parts_give_a_point_in_the_bigger_one():
    parts = [
        [[30.0, -2.0], [30.1, -2.0], [30.1, -1.9], [30.0, -1.9], [30.0, -2.0]],
        [[31.0, -1.0], [31.02, -1.0], [31.02, -0.98], [31.0, -0.98], [31.0, -1.0]],
    ]
    x, y = registry.centre_of(parts)
    assert 30.0 <= x <= 30.1 and -2.0 <= y <= -1.9


# ── a village ───────────────────────────────────────────────────────────────

def test_a_village_with_an_outline_has_a_centre_inside_it():
    _, village, rings = a_village_with_an_outline()
    point = registry.village_centre(village)
    assert set(point) == {'lat', 'lng'}
    assert inside(point, rings)


def test_a_village_centre_lies_inside_rwanda():
    _, village, _ = a_village_with_an_outline()
    west, south, east, north = registry.BOX
    point = registry.village_centre(village)
    assert west <= point['lng'] <= east and south <= point['lat'] <= north


def test_a_village_without_an_outline_has_no_centre():
    have = {village for rows in registry._village_outlines().values() for _, _, _, _, village, _, _ in rows if village}
    without = next(p['code'] for p in registry.walk() if p['level'] == 'village' and p['code'] not in have)
    assert registry.village_centre(without) is None


@pytest.mark.parametrize('code', ['', 'nonsense', '0', None])
def test_an_unknown_village_has_no_centre(code):
    assert registry.village_centre(code) is None


def test_a_sector_code_is_not_a_village():
    sector, _, _ = a_village_with_an_outline()
    assert registry.village_centre(sector) is None


def test_the_centre_is_rounded_to_about_a_metre():
    _, village, _ = a_village_with_an_outline()
    point = registry.village_centre(village)
    assert point['lat'] == round(point['lat'], 5) and point['lng'] == round(point['lng'], 5)


# ── a sector ────────────────────────────────────────────────────────────────

def test_a_sector_has_a_centre_inside_it():
    sector = next(p['code'] for p in registry.walk() if p['level'] == 'sector')
    point = registry.sector_centre(sector)
    assert inside(point, registry.outline(sector))


def test_every_sector_has_a_centre():
    missing = [p['code'] for p in registry.walk() if p['level'] == 'sector' and registry.sector_centre(p['code']) is None]
    assert missing == []


@pytest.mark.parametrize('code', ['', 'nonsense', None])
def test_an_unknown_sector_has_no_centre(code):
    assert registry.sector_centre(code) is None
