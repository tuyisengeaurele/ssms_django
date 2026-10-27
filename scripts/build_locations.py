"""Build the Rwanda location data that the app ships, from two public sources. Run by hand, never by the app.

    python scripts/build_locations.py <murwanda rwanda.min.json> <sector shapefile base name> <output folder>

Sources (see locations/README.md for licences and what was checked):
* the place codes and names of every province, district, sector, cell and village, from the `murwanda` package
  (MIT, a copy of the government place codes);
* the 416 sector boundaries of the World Bank "Rwanda Admin Boundaries and Villages" dataset (CC BY 4.0, 2012).

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

    to_lonlat = Transformer.from_crs(
        '+proj=tmerc +lat_0=0 +lon_0=30 +k=0.9999 +x_0=500000 +y_0=5000000 +ellps=GRS80 +units=m +no_defs',
        'EPSG:4326', always_xy=True,
    ).transform

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
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
