"""The email that carries an admin's reply to a contact message, and the confirmation the sender gets first. Both are the
usual SSMS email, with its whole footer, in the language of the message."""
import html as html_escapes
from datetime import datetime, timezone

import pytest

from core.mail import Email

WRITTEN = datetime(2026, 11, 20, 9, 30, tzinfo=timezone.utc)
SIGN_OFF = {'en': 'The SSMS team', 'fr': "L'équipe SSMS", 'rw': 'Itsinda rya SSMS'}
HEADING = {'en': 'Our reply to your message', 'fr': 'Notre réponse à votre message', 'rw': 'Igisubizo ku butumwa bwawe'}
GREETING = {'en': 'Hello,', 'fr': 'Bonjour,', 'rw': 'Muraho,'}
DATE_LINE = {'en': 'You wrote to us on 20/11/2026.', 'fr': 'Vous nous avez écrit le 20/11/2026.', 'rw': 'Watwandikiye ku wa 20/11/2026.'}
PRIVACY = {'en': 'Privacy', 'fr': 'Confidentialité', 'rw': 'Ibanga'}
TERMS = {'en': 'Terms', 'fr': 'Conditions', 'rw': 'Amabwiriza'}


def both_parts(email):
    """The HTML as a person reads it (entities turned back into letters) and the plain text."""
    return html_escapes.unescape(email.html()), email.plain()


def test_an_ordinary_email_is_still_in_english():
    # Every other email of SSMS goes through the same template, which now takes a language.
    email = Email(heading='A heading', reason='A reason.', intro=('Text.',), button=('Open it', 'https://ssms.example/x'))
    html, plain = both_parts(email)
    assert '<html lang="en">' in html
    assert 'If the button does not work, copy this address into your browser:<br>' in html
    assert '<p style="margin:0;">The SSMS team</p>' in html
    assert '>Privacy</a> · <a ' in html and '>Terms</a></p>' in html
    assert '\nThe SSMS team\n' in plain and '\nPrivacy: ' in plain and '\nTerms: ' in plain


def test_every_language_has_every_word():
    from core.mail_words import WORDS

    assert set(WORDS) == {'en', 'fr', 'rw'}
    for lang in ('fr', 'rw'):
        assert set(WORDS[lang]) == set(WORDS['en'])
        assert all(WORDS[lang].values())


@pytest.mark.parametrize('lang', ['en', 'fr', 'rw'])
def test_a_reply_reads_in_the_language_of_the_message(settings, lang):
    from contacts.reply_email import reply_email
    from core.mail_words import WORDS

    html, plain = both_parts(reply_email('Our answer.', WRITTEN, lang))
    assert f'<html lang="{lang}">' in html
    for part in (html, plain):
        for words in (HEADING, GREETING, DATE_LINE, SIGN_OFF, PRIVACY, TERMS):
            assert words[lang] in part, words[lang]
        assert 'Our answer.' in part
        assert WORDS[lang]['reply_reason'] in part
    if lang != 'en':
        assert SIGN_OFF['en'] not in html and SIGN_OFF['en'] not in plain


@pytest.mark.parametrize('lang', ['en', 'fr', 'rw'])
def test_a_reply_keeps_the_whole_footer(settings, lang):
    from contacts.reply_email import reply_email

    settings.SUPPORT_EMAIL, settings.ORG_ADDRESS = 'help@ssms.example', 'Kigali, Rwanda'
    settings.FRONTEND_URL = 'https://ssms.example'
    for part in both_parts(reply_email('Our answer.', WRITTEN, lang)):
        for line in ('Smart Sericulture Management System (SSMS)', 'help@ssms.example', 'Kigali, Rwanda', 'https://ssms.example',
                     'https://ssms.example/privacy', 'https://ssms.example/terms'):
            assert line in part, line


def test_the_reply_has_no_button_and_asks_nothing_of_the_reader():
    from contacts.reply_email import REPLY_SUBJECT, reply_email

    assert REPLY_SUBJECT == 'Re: Message to SSMS'
    email = reply_email('Our answer.', WRITTEN, 'en')
    assert email.button is None and email.facts == () and email.closing == ()


def test_paragraphs_and_line_breaks_show_as_typed_and_typed_html_stays_words():
    from contacts.reply_email import reply_email

    body = 'First paragraph.\n\nSecond one,\non two lines. <b>not bold</b> & "quoted"'
    email = reply_email(body, WRITTEN, 'en')
    assert body in email.plain()
    html = email.html()
    assert '&lt;b&gt;not bold&lt;/b&gt;' in html and '<b>not bold</b>' not in html
    assert 'white-space:pre-line;">First paragraph.\n\nSecond one,\non two lines.' in html


def test_an_unknown_language_reads_english():
    from contacts.reply_email import reply_email

    assert SIGN_OFF['en'] in reply_email('x', WRITTEN, 'de').plain()
    assert '<html lang="en">' in reply_email('x', WRITTEN, None).html()


def test_the_date_is_the_day_it_was_in_rwanda():
    from contacts.reply_email import reply_email

    late_in_london = datetime(2026, 11, 25, 23, 30, tzinfo=timezone.utc)
    assert '26/11/2026' in reply_email('x', late_in_london, 'en').plain()


def test_an_older_database_time_without_a_zone_is_taken_as_utc():
    from contacts.reply_email import reply_email

    assert '26/11/2026' in reply_email('x', datetime(2026, 11, 25, 23, 30), 'en').plain()
