"""Cut the three Latin font files down to what the app uses. Run by hand when the glyph list or the weights change:

    pip install fonttools brotli
    python frontend/scripts/fonts/make_fonts.py

Why: the full Latin files carry hundreds of glyphs and the whole weight range 100 to 900. The app speaks English, French and
Kinyarwanda and uses a few weights, so each file is cut to the characters of those languages and to the range of weights the
stylesheets ask for. The output goes to frontend/src/fonts/ and is committed, so the build needs no Python. A character outside
the cut still draws in the same font: src/fonts/fonts.css leaves the original files behind it as the fallback.

The characters are in glyphs.txt, and src/fonts/fonts.css repeats them as its unicode-range. fontFiles.test.ts holds the two
together and checks that the texts of the app stay inside the list.
"""
from __future__ import annotations

import re
import sys
from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).resolve().parent
FRONTEND = HERE.parent.parent
SOURCE = FRONTEND / 'node_modules' / '@fontsource-variable'
OUT = FRONTEND / 'src' / 'fonts'

# (output name, fontsource file, lowest weight, highest weight). The weights are the ones the stylesheets use today:
# Fraunces 400 to 700 upright, Geist 400 to 700, and the italic at one weight, 450, the one of the headline accent (the italic is
# also used at 400 and 500 in a few places, where 450 is hard to tell apart). Checked in a browser on 2026-11-19.
FONTS = [
    ('fraunces-latin-normal', 'fraunces/files/fraunces-latin-wght-normal.woff2', 400, 700),
    ('fraunces-latin-italic', 'fraunces/files/fraunces-latin-wght-italic.woff2', 450, 450),
    ('geist-latin-normal', 'geist/files/geist-latin-wght-normal.woff2', 400, 700),
]

# Features the stylesheets use (tabular and lining figures) and the ones that make text read right. Everything else is dropped.
FEATURES = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'tnum', 'lnum', 'onum', 'pnum', 'case']


def codepoints(text: str) -> list[int]:
    """The code points of a unicode-range list such as "U+0020-007E, U+00A0"."""
    found: list[int] = []
    for part in re.findall(r'U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?', text):
        low = int(part[0], 16)
        high = int(part[1], 16) if part[1] else low
        found.extend(range(low, high + 1))
    return found


def build(name: str, source: str, low: int, high: int, unicodes: list[int]) -> Path:
    font = TTFont(SOURCE / source)
    # One weight (low equals high) makes a plain font with no variation tables, which is much smaller.
    font = instancer.instantiateVariableFont(font, {'wght': low if low == high else (low, high)})
    # Reload it: the subsetter is steadier on a font that has been written out and read back.
    buffer = BytesIO()
    font.flavor = None
    font.save(buffer)
    buffer.seek(0)
    font = TTFont(buffer)
    options = subset.Options()
    options.layout_features = FEATURES
    options.flavor = 'woff2'
    options.hinting = False
    options.notdef_outline = True
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    options.drop_tables += ['DSIG']
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    target = OUT / f'{name}.woff2'
    subset.save_font(font, str(target), options)
    return target


def main() -> int:
    unicodes = codepoints((HERE / 'glyphs.txt').read_text(encoding='utf8'))
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, source, low, high in FONTS:
        target = build(name, source, low, high, unicodes)
        size = target.stat().st_size
        total += size
        print(f'{target.name}: {size} bytes (weights {low} to {high}, {len(unicodes)} characters asked for)')
    print(f'total {total} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
