"""The words in a PDF are the words on the screen, in the same three languages, so the two cannot drift apart."""
import importlib.util
import re
from pathlib import Path

import pytest

from core.doc_text import KEYS, TEXT, t

ROOT = Path(__file__).resolve().parents[1]
LANGS = ('en', 'fr', 'rw')


def load_builder():
    spec = importlib.util.spec_from_file_location('build_doc_text', ROOT / 'scripts' / 'build_doc_text.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope='module')
def screen():
    return load_builder().read_screen_text()


def test_every_language_has_every_key():
    for lang in LANGS:
        assert set(TEXT[lang]) == set(KEYS)


def test_no_text_is_empty():
    for lang in LANGS:
        for key, value in TEXT[lang].items():
            assert value.strip(), (lang, key)


def test_every_language_uses_the_same_placeholders():
    def names(text):
        return set(re.findall(r'\{(\w+)\}', text))

    for key in KEYS:
        assert names(TEXT['fr'][key]) == names(TEXT['en'][key]), key
        assert names(TEXT['rw'][key]) == names(TEXT['en'][key]), key


def test_the_words_match_the_screen_exactly(screen):
    """If a sentence is changed on the screen, rebuild with: python scripts/build_doc_text.py"""
    for key in KEYS:
        for lang in LANGS:
            assert TEXT[lang][key] == screen[key][lang], (key, lang)


def test_a_placeholder_is_filled():
    assert t('en', 'bdDay', n=3, total=28, date='6 June') == 'Day 3 of 28. Harvest is expected on 6 June.'
    assert t('fr', 'bdDay', n=3, total=28, date='6 juin') == 'Jour 3 sur 28. Récolte attendue le 6 juin.'


def test_an_unknown_language_reads_in_english():
    assert t('zz', 'brAlertsNone') == 'No alerts waiting.'


def test_a_text_with_no_placeholder_is_returned_as_it_is():
    assert t('rw', 'brDeaths') == 'Impfu'


def test_the_screen_has_no_dash_characters_in_these_words():
    for lang in LANGS:
        for value in TEXT[lang].values():
            assert chr(8212) not in value and chr(8211) not in value
