"""Copy the words PDF documents need from the screen translations into core/doc_text.py.

The screens keep their words in frontend/src/i18n/pages.ts. A PDF is made on the server, so it needs the same
sentences in Python. This script copies them, and tests/test_doc_text.py fails when the two differ.

Run after changing any of these sentences:  python scripts/build_doc_text.py
"""
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / 'frontend' / 'src' / 'i18n' / 'pages.ts'
OUT = ROOT / 'core' / 'doc_text.py'

# The sentences the PDF documents use. Add a key here, then run this script.
KEYS = [
    'ptBatchReport', 'hpSubtitle', 'brBatch',
    'bdStage', 'bdFarm', 'bdPlace', 'bdStarted', 'bdExpected', 'bdBreed', 'bdNotes',
    'brStartedWith', 'bdQtyWorms', 'bdQtyBoxesOne', 'bdQtyBoxes', 'bdDay', 'bdDayLate',
    'brRooms', 'brRoomFrom', 'brRoomSpan',
    'brConditions', 'brTemp', 'brHum', 'brInRange', 'brNoReadings',
    'brDeaths', 'brDeathsNone', 'bdDeathsTotal', 'bdDeathsTotalOf', 'bdDeathsDay', 'brColWorms', 'bdDeathsNote',
    'brChecks', 'brChecksNone', 'brChecksSummary', 'brChecksSummaryOne', 'hpColDate', 'brColResult', 'brColConfidence',
    'brAlerts', 'brAlertsNone', 'brAlertsWaiting', 'brAlertsWaitingOne',
    'brHarvest', 'brHarvestNone', 'brHarvestSum', 'brHarvestSumOne', 'hpGradeName', 'lotScan', 'lotPrintCaption',
    'brPrepared',
    # The farm summary
    'ptFarmSummary', 'fsFarm', 'fsOwner', 'fsRegistered', 'fsRoomCol', 'fsRoomBatchesCol', 'fsRoomsNone', 'fsBatches', 'fsBatchCol', 'fsBatchesNone',
    # The cooperative report
    'crTitle', 'crPeriod', 'crAll', 'crSummary', 'crFarms', 'crFarmers', 'crBatchesNow', 'crBatchesStarted',
    'crHarvest', 'crHarvestNone', 'crChecks', 'crChecksNone', 'crColCount', 'crAlerts', 'crAlertsSum', 'crAlertsSumOne', 'crAlertsNone',
    'crColType', 'crRisk', 'crRiskNote', 'crColFarm', 'crColLevel', 'crColWhy', 'crEachFarm', 'crColBatches', 'crColKg', 'crColAlerts',
    'alTypeTemperature', 'alTypeHumidity', 'alTypeDisease', 'alTypeStage', 'alTypeSystem',
    'fkNoFarms', 'fkHigh', 'fkMedium', 'fkOk', 'fkDisease', 'fkDiseaseOne', 'fkAir', 'fkAirOne', 'fkDevices', 'fkDevicesOne',
]

LINE = re.compile(r'^\s*(\w+):\s*k\((.*)\),\s*$')


def read_screen_text() -> dict:
    """{key: {'en': ..., 'fr': ..., 'rw': ...}} for every key in pages.ts that is written as one k(...) line."""
    found = {}
    for line in PAGES.read_text(encoding='utf-8').splitlines():
        match = LINE.match(line)
        if not match:
            continue
        try:
            en, fr, rw = ast.literal_eval(f'({match.group(2)},)')
        except (SyntaxError, ValueError):
            continue
        found[match.group(1)] = {'en': en, 'fr': fr, 'rw': rw}
    return found


def build() -> str:
    screen = read_screen_text()
    missing = [key for key in KEYS if key not in screen]
    if missing:
        raise SystemExit(f'Not found in pages.ts as one line: {", ".join(missing)}')
    out = ['"""The sentences PDF documents share with the screens. Made by scripts/build_doc_text.py, do not edit by hand."""', '']
    out.append('KEYS = [')
    out += [f'    {key!r},' for key in KEYS]
    out.append(']')
    out.append('')
    out.append('TEXT = {')
    for lang in ('en', 'fr', 'rw'):
        out.append(f'    {lang!r}: {{')
        out += [f'        {key!r}: {screen[key][lang]!r},' for key in KEYS]
        out.append('    },')
    out.append('}')
    out += ['', '', 'def t(lang: str, key: str, **values) -> str:',
            '    """One sentence in the language, with {placeholders} filled. An unknown language reads in English."""',
            "    text = TEXT.get(lang, TEXT['en'])[key]",
            '    for name, value in values.items():',
            "        text = text.replace('{' + name + '}', str(value))",
            '    return text', '']
    return '\n'.join(out)


if __name__ == '__main__':
    OUT.write_text(build(), encoding='utf-8')
    print(f'Wrote {OUT.relative_to(ROOT)}')
