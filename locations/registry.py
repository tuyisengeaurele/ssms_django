"""The places of Rwanda, from province down to village, and the sector a point on the map falls in.

The data lives in two files next to this one, built by scripts/build_locations.py. See locations/README.md for where it
comes from. Nothing here touches the database: the files are read once and kept in memory.

A place is a dict with `code`, `name`, `level` and `parent` (the code of the place above it, None for a province).
"""
import json
import math
from functools import cache
from pathlib import Path

DATA = Path(__file__).parent / 'data'
LEVELS = ['province', 'district', 'sector', 'cell', 'village']
# Rwanda lies well inside this box, so a point outside it is out of the country without any further work.
BOX = (28.8, -3.0, 31.0, -0.9)


@cache
def _index() -> dict:
    """Every place by code, and the codes of each place's children."""
    places: dict[str, dict] = {}
    kids: dict[str | None, list[str]] = {None: []}

    def add(node, level, parent):
        code, name = node[0], node[1]
        places[code] = {'code': code, 'name': name, 'level': level, 'parent': parent}
        kids.setdefault(parent, []).append(code)
        kids.setdefault(code, [])
        if level != 'village':  # a village is just [code, name]
            for child in node[2]:
                add(child, LEVELS[LEVELS.index(level) + 1], code)

    for province in json.loads((DATA / 'rwanda.json').read_text(encoding='utf-8')):
        add(province, 'province', None)
    for parent, codes in kids.items():
        codes.sort(key=lambda c: places[c]['name'].casefold())
    return {'places': places, 'kids': kids}


@cache
def _outlines() -> dict:
    """Each sector's rings, with the box around them so most sectors are ruled out with four comparisons."""
    raw = json.loads((DATA / 'sectors.json').read_text(encoding='utf-8'))
    out = {}
    for code, rings in raw.items():
        xs = [x for ring in rings for x, _ in ring]
        ys = [y for ring in rings for _, y in ring]
        out[code] = (min(xs), min(ys), max(xs), max(ys), rings)
    return out


def walk():
    """Every place in the country."""
    return iter(_index()['places'].values())


def children(parent: str | None):
    """The places directly under `parent`, by name. None for the provinces. [] for a village, None for an unknown code."""
    index = _index()
    if parent is not None and parent not in index['places']:
        return None
    return [{'code': c, 'name': index['places'][c]['name']} for c in index['kids'][parent]]


def chain(code: str) -> dict | None:
    """The place and everything above it, as {level: {'code', 'name'}}, from the province down."""
    places = _index()['places']
    found = []
    while code is not None:
        place = places.get(code)
        if place is None:
            return None
        found.append(place)
        code = place['parent']
    return {p['level']: {'code': p['code'], 'name': p['name']} for p in reversed(found)}


def check_address(province: str, district: str, sector: str, cell: str, village: str) -> dict | None:
    """The full chain when the five codes belong together, otherwise None."""
    found = chain(village)
    given = dict(zip(LEVELS, (province, district, sector, cell, village)))
    if found is None or any(found[level]['code'] != code for level, code in given.items()):
        return None
    return found


def describe(found: dict, street: str = '') -> str:
    """A place as one line, the smallest part first: street, village, cell, sector, district, province."""
    parts = [street.strip()] + [found[level]['name'] for level in reversed(LEVELS) if level in found]
    return ', '.join(part for part in parts if part)


def outline(sector: str):
    """The rings of a sector as [[longitude, latitude], ...], or None."""
    entry = _outlines().get(sector)
    return entry[4] if entry else None


def _on_edge(x, y, ring) -> bool:
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if min(x1, x2) - 1e-9 <= x <= max(x1, x2) + 1e-9 and min(y1, y2) - 1e-9 <= y <= max(y1, y2) + 1e-9:
            if abs((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) <= 1e-9:
                return True
    return False


def _inside(x, y, rings) -> bool:
    """Even-odd rule over all the rings, so a hole in a sector is left out. A point on an edge counts as inside."""
    if any(_on_edge(x, y, ring) for ring in rings):
        return True
    inside = False
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                inside = not inside
    return inside


def _number(value, low, high) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError('Not a number.') from None
    if not math.isfinite(number) or not low <= number <= high:
        raise ValueError('Out of range.')
    return number


def locate(lat, lng) -> dict | None:
    """The province, district and sector that contain the point, or None when it is not inside a Rwanda sector."""
    lat, lng = _number(lat, -90, 90), _number(lng, -180, 180)
    west, south, east, north = BOX
    if not (west <= lng <= east and south <= lat <= north):
        return None
    for code, (x1, y1, x2, y2, rings) in _outlines().items():
        if x1 <= lng <= x2 and y1 <= lat <= y2 and _inside(lng, lat, rings):
            found = chain(code)
            return {level: found[level] for level in ('province', 'district', 'sector')}
    return None
