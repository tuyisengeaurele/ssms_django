# Rwanda places

The list of provinces, districts, sectors, cells and villages the farm form uses, and the sector boundaries behind
"Use my location". The app only reads the two files in `data/`. `scripts/build_locations.py` made them.

## Where the data comes from

| File | What | Source | Licence |
|------|------|--------|---------|
| `data/rwanda.json` | Place codes and names, province to village | The `murwanda` npm package, which copies the government place codes (checked 27 October 2026) | MIT |
| `data/sectors.json` | One outline for each of the 416 sectors, simplified to about 50 metres | World Bank, "Rwanda Admin Boundaries and Villages", boundaries from 2012 | CC BY 4.0 |

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
- "Use my location" can place a person in a sector. Cells and villages have no boundary data here, so the person
  chooses them by hand.

## Changing the data

Rebuild with the script, then run the tests in `tests/test_locations_data.py` and `tests/test_locations_locate.py`.
Codes are what farms store, so a code is never reused for another place.
