# Rwanda places

The list of provinces, districts, sectors, cells and villages the farm form uses, and the boundaries behind
"Use my location". The app only reads the files in `data/`. `scripts/build_locations.py` made them.

## Where the data comes from

| File | What | Source | Licence |
|------|------|--------|---------|
| `data/rwanda.json` | Place codes and names, province to village | The `murwanda` npm package, which copies the government place codes (checked 27 October 2026) | MIT |
| `data/sectors.json` | One outline for each of the 416 sectors, simplified to about 50 metres | World Bank, "Rwanda Admin Boundaries and Villages", boundaries from 2012 | CC BY 4.0 |
| `data/villages/<district code>.json` | The outlines of 14,802 villages, one file for each of the 30 districts (7 MB in all), simplified to about 30 metres | The same World Bank dataset, `rwa_villages.zip` (14,815 villages) | CC BY 4.0 |

Credit for the boundaries: World Bank Data Catalog, "Rwanda Admin Boundaries and Villages", Creative Commons Attribution 4.0.

## What was checked, and what is not perfect

- 5 provinces, 30 districts, 416 sectors and 2,148 cells match the official figures.
- The list has **14,842 villages**. The figure usually quoted is 14,837. The second package we compared has exactly 14,837
  but 2,149 cells, so no copy matches every official figure. We kept the one with codes and 2,148 cells.
- The two packages agree on 412 of the 416 sector names. The other four are spelling variants, and we show the spelling
  the districts use: Rilima (Bugesera), Kigali and Mageragere (Nyarugenge) and Shyorongi (Rulindo).
- 44 sectors came in capitals and were turned into normal capitals.
- Some village names in the source look like typos ("Umudugudu WaV", "Kiv0mo"). They are left as they are, because
  guessing would be worse than showing what the register says.
- The sector boundaries date from 2012. Sector borders have been stable since 2006, but a later change would not show.
- "Use my location" places a person in a sector, and in a cell and village when the village outlines hold the point.
  Only the file of the district the point is in is read.
- **The village outlines and the register do not share safe codes.** The 2012 file and the current register number
  villages differently, so the same code can name a different village in each (for example Nyabuliba cell in Jali:
  "Nyaburira" in one and "Byimana" in the other). So a village is matched by the names of its district, sector, cell
  and village together, and the code comes from the register. Of the 14,815 outlines:
  - 14,663 match a register village by all four names and give a village and its cell;
  - 139 give the cell only: 125 match a cell but no village, and 14 have the same four names as another outline, so
    they cannot be told apart;
  - 13 match no cell and are left out.

  That leaves 179 villages of the register (1.2 %) without an outline. A point in one of them gives the cell or the
  sector, and the person chooses the village.
- The outlines are simplified to about 30 metres, which is about what a phone's position is good for, and they date
  from 2012. A point close to a border can land in the village next door, so the form tells the person to check.
- There is no street data. The street stays a field the person types.

## Changing the data

Rebuild with the script, then run the tests in `tests/test_locations_data.py`, `tests/test_locations_locate.py` and
`tests/test_locations_villages.py`. Codes are what farms store, so a code is never reused for another place.

To rebuild the village outlines, download `rwa_villages.zip` from the World Bank Data Catalog (dataset 0041453), unpack
it, and run `python scripts/build_locations.py villages <path to Village, without .shp> locations/data`. The script
needs `pyshp`, `pyproj` and `shapely`, which are not app requirements.
