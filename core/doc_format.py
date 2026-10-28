"""How numbers, dates and names are written in the PDF documents, in each of the three languages."""
from core.pdf import MONTHS

LANGS = ('en', 'fr', 'rw')
GRADES = ('A', 'B', 'C')
STAGE_NAMES = {'EGG': 'Egg', 'LARVA': 'Larva', 'PUPA': 'Pupa', 'COCOON': 'Cocoon', 'HARVEST': 'Harvest'}


def clean_lang(value) -> str:
    """The language asked for, or English when it is missing or unknown."""
    return value if value in LANGS else 'en'


def num(value) -> str:
    """23.0 reads as 23, like the screen."""
    value = float(value)
    return str(int(value)) if value == int(value) else str(round(value, 2))


def count(n: int, lang: str) -> str:
    """1234 as 1,234 in English and 1 234 in French and Kinyarwanda."""
    return f'{n:,}'.replace(',', ',' if lang == 'en' else ' ')


def day(moment, lang: str) -> str:
    """For example "28 October 2026"."""
    return f'{moment.day} {MONTHS[clean_lang(lang)][moment.month - 1]} {moment.year}'


def round1(value: float) -> float:
    """One decimal, half up, like Math.round on the screen."""
    return int(value * 10 + 0.5) / 10 if value >= 0 else -int(-value * 10 + 0.5) / 10
