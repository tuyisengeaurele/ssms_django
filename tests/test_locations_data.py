"""The Rwanda places the app ships: complete, consistent and tidy."""
import re

import pytest

from locations import registry

LEVEL_LENGTHS = {'province': 1, 'district': 3, 'sector': 6, 'cell': 7, 'village': 9}
LEVELS = list(LEVEL_LENGTHS)


def all_places():
    return list(registry.walk())


def test_the_counts_match_the_official_figures_except_where_the_source_differs():
    counts = {level: sum(1 for p in all_places() if p['level'] == level) for level in LEVEL_LENGTHS}
    # The government quotes 14,837 villages. The place-code list carries 14,842, so five are not in that figure.
    assert counts == {'province': 5, 'district': 30, 'sector': 416, 'cell': 2148, 'village': 14842}


def test_every_code_is_unique_and_has_the_length_of_its_level():
    places = all_places()
    assert len({p['code'] for p in places}) == len(places)
    for p in places:
        assert re.fullmatch(r'\d+', p['code']) and len(p['code']) == LEVEL_LENGTHS[p['level']], p


def test_names_are_tidy():
    for p in all_places():
        assert p['name'] and p['name'] == p['name'].strip() and '  ' not in p['name'], p


def test_no_name_is_shouted_in_capitals():
    shouted = [p['name'] for p in all_places() if p['name'].isupper() and len(p['name']) > 3]
    assert shouted == []


def test_every_place_sits_under_a_place_one_level_up():
    by_code = {p['code']: p for p in all_places()}
    for p in by_code.values():
        if p['level'] != 'province':
            parent = by_code[p['parent']]
            assert LEVELS.index(parent['level']) == LEVELS.index(p['level']) - 1


def test_the_five_provinces_and_thirty_districts_are_the_known_ones():
    provinces = {c['name'] for c in registry.children(None)}
    assert provinces == {'Kigali City', 'Southern Province', 'Western Province', 'Northern Province', 'Eastern Province'}
    districts = {d['name'] for p in registry.children(None) for d in registry.children(p['code'])}
    assert {'Gasabo', 'Kicukiro', 'Nyarugenge', 'Musanze', 'Huye', 'Rubavu', 'Nyagatare', 'Rusizi', 'Rwamagana'} <= districts
    assert len(districts) == 30


@pytest.mark.parametrize('district, sector', [
    ('Bugesera', 'Rilima'), ('Nyarugenge', 'Kigali'), ('Nyarugenge', 'Mageragere'), ('Rulindo', 'Shyorongi'),
])
def test_the_spellings_the_districts_use_are_the_ones_shown(district, sector):
    names = {
        s['name']
        for d in all_places() if d['level'] == 'district' and d['name'] == district
        for s in registry.children(d['code'])
    }
    assert sector in names


@pytest.mark.parametrize('wrong', ['Ririma', 'Kigali City'])
def test_the_variant_spellings_are_not_shown_as_sectors(wrong):
    assert wrong not in {p['name'] for p in all_places() if p['level'] == 'sector'}


def test_children_come_sorted_by_name_for_a_dropdown():
    district = next(p['code'] for p in all_places() if p['level'] == 'district')
    names = [c['name'] for c in registry.children(district)]
    assert names == sorted(names, key=str.casefold)


def test_children_of_a_village_are_none_and_of_an_unknown_code_are_unknown():
    village = next(p['code'] for p in all_places() if p['level'] == 'village')
    assert registry.children(village) == []
    assert registry.children('999') is None
    assert registry.children('not a code') is None


def codes_of(village):
    return {level: part['code'] for level, part in registry.chain(village['code']).items()}


def test_a_full_address_is_checked_from_the_province_down():
    village = next(p for p in all_places() if p['level'] == 'village')
    codes = codes_of(village)
    assert list(codes) == LEVELS
    checked = registry.check_address(**codes)
    assert checked is not None and checked['village']['name'] == village['name']


def test_an_address_whose_parts_do_not_belong_together_is_refused():
    village = next(p for p in all_places() if p['level'] == 'village')
    codes = codes_of(village)
    other_province = next(c['code'] for c in registry.children(None) if c['code'] != codes['province'])
    assert registry.check_address(**{**codes, 'province': other_province}) is None
    assert registry.check_address(**{**codes, 'village': '000000000'}) is None


def test_every_sector_has_an_outline_inside_rwanda():
    for sector in (p for p in all_places() if p['level'] == 'sector'):
        rings = registry.outline(sector['code'])
        assert rings, sector
        for ring in rings:
            for lng, lat in ring:
                assert 28.8 < lng < 31.0 and -3.0 < lat < -0.9, (sector, lng, lat)
