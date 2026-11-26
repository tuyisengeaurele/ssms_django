"""Which of the three languages a contact message is written in, from its words (contacts/language.py)."""
import re
import sys
from pathlib import Path

import pytest

from contacts.language import WORDS, detect_language

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_doc_text import read_screen_text  # noqa: E402


@pytest.mark.parametrize('text, expected', [
    ('Hello, I would like a demo.', 'en'),
    ('Bonjour, je voudrais une démonstration.', 'fr'),
    ('Muraho, ndashaka kumenya uko mwamfasha.', 'rw'),
    ("Turi koperative y'abahinzi i Gatsibo.", 'rw'),
])
def test_ordinary_sentences_are_recognised(text, expected):
    assert detect_language(text, fallback=None) == expected


@pytest.mark.parametrize('text', [
    pytest.param('Demo please', id='one known word'),
    pytest.param('Merci beaucoup', id='two words, one known'),
    pytest.param('', id='empty'),
    pytest.param('0788 123 456 !!!', id='no words'),
    pytest.param('and avec kandi', id='one word of each'),
    pytest.param('the and je nous', id='a tie'),
])
def test_unclear_text_gives_the_fallback_and_is_never_guessed(text):
    assert detect_language(text, fallback=None) is None
    assert detect_language(text, fallback='fr') == 'fr'
    assert detect_language(text) == 'en'


def test_what_was_written_wins_over_the_page_it_was_written_on():
    assert detect_language('Muraho, turashaka kumenya uko mwadufasha mu bworozi.', fallback='en') == 'rw'


@pytest.mark.parametrize('bad', ['de', '', 'EN', 7])
def test_a_fallback_that_is_not_one_of_the_three_counts_as_english(bad):
    assert detect_language('', fallback=bad) == 'en'


def test_no_word_is_in_two_lists():
    assert set(WORDS) == {'en', 'fr', 'rw'}
    assert not (WORDS['en'] & WORDS['fr']) and not (WORDS['en'] & WORDS['rw']) and not (WORDS['fr'] & WORDS['rw'])


# The app's own screen sentences are the largest honest sample of the three languages we have. The French and Kinyarwanda are
# drafts, and visitors do not write the way screens do, so this guards the method and promises nothing about every message.
def sentences(lang, least):
    return [v[lang] for v in read_screen_text().values() if len(re.findall(r'[^\W\d_]+', v[lang])) >= least]


@pytest.mark.parametrize('lang, at_least', [('en', 0.80), ('fr', 0.85), ('rw', 0.75)])
def test_most_longer_sentences_of_the_app_are_recognised(lang, at_least):
    sample = sentences(lang, 8)
    assert len(sample) > 100
    right = sum(detect_language(text, fallback=None) == lang for text in sample)
    assert right / len(sample) >= at_least, f'{lang}: {right} of {len(sample)}'


@pytest.mark.parametrize('lang', ['en', 'fr', 'rw'])
def test_a_sentence_of_the_app_is_hardly_ever_taken_for_another_language(lang):
    sample = sentences(lang, 4)
    wrong = [text for text in sample if detect_language(text, fallback=None) not in (lang, None)]
    assert len(wrong) / len(sample) <= 0.01, wrong[:5]
