"""How numbers, dates and names are written in the PDF documents."""
from datetime import datetime, timezone

from core.doc_format import clean_lang, count, day, num, round1


def test_a_whole_number_has_no_decimal_point():
    assert num(23.0) == '23' and num('16.50') == '16.5' and num(1.333) == '1.33'


def test_thousands_are_grouped_by_language():
    assert count(1234567, 'en') == '1,234,567'
    assert count(1234567, 'fr') == '1\u202f234\u202f567'
    assert count(1234567, 'rw') == '1\u202f234\u202f567'
    assert count(12, 'en') == '12'


def test_a_day_is_written_in_the_month_names_of_the_language():
    moment = datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc)
    assert day(moment, 'en') == '28 October 2026'
    assert day(moment, 'fr') == '28 octobre 2026'
    assert day(moment, 'rw') == '28 Ukwakira 2026'


def test_a_day_in_an_unknown_language_is_english():
    assert day(datetime(2026, 1, 5, tzinfo=timezone.utc), 'zz') == '5 January 2026'


def test_the_language_is_checked():
    assert [clean_lang(x) for x in ('fr', 'rw', 'en', 'zz', None, '')] == ['fr', 'rw', 'en', 'en', 'en', 'en']


def test_one_decimal_rounds_half_up():
    assert round1(22.25) == 22.3 and round1(22.24) == 22.2 and round1(0.0) == 0.0
