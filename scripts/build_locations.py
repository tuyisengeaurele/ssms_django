"""Build the Rwanda location data that the app ships, from two public sources. Run by hand, never by the app.

    python scripts/build_locations.py <murwanda rwanda.min.json> <sector shapefile base name> <output folder>
    python scripts/build_locations.py villages <village shapefile base name> <data folder>

Sources (see locations/README.md for licences and what was checked):
* the place codes and names of every province, district, sector, cell and village, from the `murwanda` package
  (MIT, a copy of the government place codes);
* the 416 sector boundaries of the World Bank "Rwanda Admin Boundaries and Villages" dataset (CC BY 4.0, 2012);
* the village outlines of the same dataset (`rwa_villages.zip`, 14,815 villages). The second form above reads the
  `rwanda.json` already in the data folder and writes one `villages/<district code>.json` for each district, so the
  app reads only the district a point is in.

The script needs `pyshp`, `pyproj` and `shapely`. They are for this script only and are not app requirements.
It writes `rwanda.json` (the places) and `sectors.json` (one simplified outline per sector, in longitude and latitude).
"""
import json
import re
import sys
from pathlib import Path

# The two sources spell a few places differently. These are the spellings the districts themselves use.
SECTOR_NAMES = {'Kigali City': 'Kigali', 'Ririma': 'Rilima'}
CELL_NAMES = {('Kigali', 'Kigali City'): 'Kigali'}
# The boundary file's spelling of the same sectors, by (district, sector) with the capitals and gaps dropped.
BOUNDARY_ALIASES = {('nyarugenge', 'mageregere'): 'mageragere', ('rulindo', 'shyrongi'): 'shyorongi'}
# About 50 metres, far finer than a sector is wide, and it keeps the file small.
SIMPLIFY_DEGREES = 0.0005
# A village is a small place, so its outline is kept finer than a sector's: about 30 metres, which is about what a
# phone's position is good for.
VILLAGE_SIMPLIFY_DEGREES = 0.0003
PROJECTION = '+proj=tmerc +lat_0=0 +lon_0=30 +k=0.9999 +x_0=500000 +y_0=5000000 +ellps=GRS80 +units=m +no_defs'


def tidy(name: str) -> str:
    """One space between words, and a name the source wrote in all capitals (44 sectors) with a capital only at the start."""
    name = re.sub(r'\s+', ' ', name).strip()
    return name.title() if name.isupper() else name


def key(text: str) -> str:
    return re.sub(r'[^a-z0-9]', '', text.lower())


def build_places(rows: list[dict]) -> list:
    """Nested lists, [code, name, children], and a village is just [code, name]."""
    provinces: dict = {}
    for row in rows:
        sector = SECTOR_NAMES.get(tidy(row['sector_name']), tidy(row['sector_name']))
        cell = CELL_NAMES.get((sector, tidy(row['cell_name'])), tidy(row['cell_name']))
        province = provinces.setdefault(row['province_code'], [row['province_code'], tidy(row['province_name']), {}])
        district = province[2].setdefault(row['district_code'], [row['district_code'], tidy(row['district_name']), {}])
        sector_node = district[2].setdefault(row['sector_code'], [row['sector_code'], sector, {}])
        cell_node = sector_node[2].setdefault(row['cell_code'], [row['cell_code'], cell, []])
        cell_node[2].append([row['village_code'], tidy(row['village_name'])])

    def listed(level):
        return [[code, name, listed(kids) if isinstance(kids, dict) else kids] for code, name, kids in level.values()]

    return listed(provinces)


def build_outlines(places: list, shapefile_base: str) -> dict:
    import shapefile
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform

    to_lonlat = Transformer.from_crs(PROJECTION, 'EPSG:4326', always_xy=True).transform

    codes = {}
    for province in places:
        for district_code, district_name, sectors in province[2]:
            for sector_code, sector_name, _ in sectors:
                codes[(key(district_name), key(sector_name))] = sector_code

    outlines = {}
    reader = shapefile.Reader(shapefile_base)
    for record, shp in zip(reader.iterRecords(), reader.iterShapes()):
        district, sector = key(record['District']), key(record['Name'])
        sector = BOUNDARY_ALIASES.get((district, sector), sector)
        if (district, sector) not in codes:
            sys.exit(f'No place matches the boundary of {record["Name"]} in {record["District"]}.')
        polygon = transform(to_lonlat, shape(shp.__geo_interface__)).simplify(SIMPLIFY_DEGREES)
        parts = polygon.geoms if polygon.geom_type == 'MultiPolygon' else [polygon]
        rings = []
        for part in parts:
            rings.append([[round(x, 5), round(y, 5)] for x, y in part.exterior.coords])
            rings.extend([[round(x, 5), round(y, 5)] for x, y in hole.coords] for hole in part.interiors)
        outlines[codes[(district, sector)]] = rings
    missing = set(codes.values()) - set(outlines)
    if missing:
        sys.exit(f'{len(missing)} sector(s) have no boundary: {sorted(missing)[:5]}')
    return outlines


def _rings(polygon) -> list:
    parts = polygon.geoms if polygon.geom_type == 'MultiPolygon' else [polygon]
    rings = []
    for part in parts:
        rings.append([[round(x, 5), round(y, 5)] for x, y in part.exterior.coords])
        rings.extend([[round(x, 5), round(y, 5)] for x, y in hole.coords] for hole in part.interiors)
    return rings


def build_villages(places: list, shapefile_base: str) -> tuple[dict, dict]:
    """{sector code: [[village code or '', cell code, rings], ...]} and a count of what was matched.

    The 2012 outlines and the current register do not share village codes safely: the same code can name a different
    village in each. So a village is matched by the names of its district, sector, cell and village together, and the
    code comes from the register. When the names of a village do not match, or two outlines have the same names, the
    outline is kept with its cell only. When even the cell does not match, the outline is left out.
    """
    import shapefile
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform

    sectors, cells, villages = {}, {}, {}
    for province in places:
        for _, district_name, district_sectors in province[2]:
            d = key(district_name)
            for sector_code, sector_name, sector_cells in district_sectors:
                s = key(sector_name)
                sectors[(d, s)] = sector_code
                for cell_code, cell_name, cell_villages in sector_cells:
                    c = key(cell_name)
                    cells[(d, s, c)] = (sector_code, cell_code)
                    for village_code, village_name in cell_villages:
                        villages[(d, s, c, key(village_name))] = village_code

    to_lonlat = Transformer.from_crs(PROJECTION, 'EPSG:4326', always_xy=True).transform
    reader = shapefile.Reader(shapefile_base)
    rows = []
    seen: dict = {}
    for record, shp in zip(reader.iterRecords(), reader.iterShapes()):
        d = key(record['District'])
        s = BOUNDARY_ALIASES.get((d, key(record['Sector'])), key(record['Sector']))
        c = key(record['Cell'])
        rows.append((d, s, c, key(record['Name']), shp))
        seen[(d, s, c, key(record['Name']))] = seen.get((d, s, c, key(record['Name'])), 0) + 1

    out: dict = {}
    counts = {'village': 0, 'cell only': 0, 'ambiguous': 0, 'left out': 0}
    for d, s, c, v, shp in rows:
        cell = cells.get((d, s, c))
        if cell is None:
            counts['left out'] += 1
            continue
        sector_code, cell_code = cell
        village_code = villages.get((d, s, c, v), '')
        if village_code and seen[(d, s, c, v)] > 1:
            village_code = ''
            counts['ambiguous'] += 1
        polygon = transform(to_lonlat, shape(shp.__geo_interface__))
        simple = polygon.simplify(VILLAGE_SIMPLIFY_DEGREES)
        if simple.is_empty or simple.geom_type not in ('Polygon', 'MultiPolygon'):
            simple = polygon
        counts['village' if village_code else 'cell only'] += 1
        out.setdefault(sector_code, []).append([village_code, cell_code, _rings(simple)])
    for sector_code in out:
        out[sector_code].sort(key=lambda row: (row[1], row[0]))
    return dict(sorted(out.items())), counts


def main_villages(shapefile_base: str, data_folder: str) -> None:
    folder = Path(data_folder)
    places = json.loads((folder / 'rwanda.json').read_text(encoding='utf-8'))
    outlines, counts = build_villages(places, shapefile_base)
    district_of = {sector[0]: district[0] for province in places for district in province[2] for sector in district[2]}
    by_district: dict = {}
    for sector_code, rows in outlines.items():
        by_district.setdefault(district_of[sector_code], {})[sector_code] = rows
    target = folder / 'villages'
    target.mkdir(exist_ok=True)
    for old in target.glob('*.json'):
        old.unlink()
    for district_code, sectors in by_district.items():
        (target / f'{district_code}.json').write_text(json.dumps(sectors, separators=(',', ':')), encoding='utf-8')
    size = sum(f.stat().st_size for f in target.glob('*.json'))
    print(f'{sum(len(v) for v in outlines.values())} outlines in {len(by_district)} districts, {size / 1e6:.1f} MB: {counts}')


def main(source: str, shapefile_base: str, out: str) -> None:
    rows = json.loads(Path(source).read_text(encoding='utf-8'))
    places = build_places(rows)
    outlines = build_outlines(places, shapefile_base)
    folder = Path(out)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'rwanda.json').write_text(json.dumps(places, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (folder / 'sectors.json').write_text(json.dumps(outlines, separators=(',', ':')), encoding='utf-8')
    print(f'{len(places)} provinces, {len(outlines)} sector outlines written to {folder}')


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == 'villages':
        main_villages(*sys.argv[2:])
    elif len(sys.argv) == 4:
        main(*sys.argv[1:])
    else:
        sys.exit(__doc__)
