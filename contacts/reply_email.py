"""The two emails a person who used the contact form gets: the confirmation at once, and later an admin's reply.

Neither repeats anything the person typed. The form is open to anyone, so repeating a typed name or message would let it
send a stranger words of an attacker's choosing. The reply holds the admin's words and the day the person wrote.
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


def confirmation_email(lang: str | None) -> tuple[str, Email]:
    """The subject and the email that tell the sender their message arrived. Every word of it is fixed."""
    lang, words = _words(lang)
    return words['ack_subject'], Email(
        lang=lang,
        heading=words['ack_subject'],
        intro=(words['ack_intro'],),
        closing=(words['ack_closing'],),
        reason=words['ack_reason'],
    )


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
