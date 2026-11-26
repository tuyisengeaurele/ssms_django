"""The email that carries an admin's reply to a contact message.

It holds the admin's words and the day the person wrote, and nothing the person typed. The form is open to anyone, so
repeating a typed name or message would let it send a stranger words of an attacker's choosing.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from core.mail import Email
from core.mail_words import WORDS
from core.timeutil import aware

REPLY_SUBJECT = 'Re: Message to SSMS'
KIGALI = ZoneInfo('Africa/Kigali')


def _words(lang):
    return (lang, WORDS[lang]) if lang in WORDS else ('en', WORDS['en'])


def reply_email(body: str, written_at: datetime, lang: str | None) -> Email:
    lang, words = _words(lang)
    # Day, month and year in figures read the same in all three languages.
    day = aware(written_at).astimezone(KIGALI).strftime('%d/%m/%Y')
    return Email(
        lang=lang,
        heading=words['reply_heading'],
        greeting=words['reply_greeting'],
        # The template keeps the line breaks inside a paragraph, so the reply goes in whole, as the admin typed it.
        intro=(words['reply_wrote'].format(date=day), body),
        reason=words['reply_reason'],
    )
