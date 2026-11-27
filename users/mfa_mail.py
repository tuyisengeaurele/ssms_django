"""The emails about two-step sign in, in the person's own language: turned on, turned off, or reset by an admin.

None of them holds a secret, a code or a link that signs anyone in.
"""
from core.mail import Email
from core.mail_words import WORDS

from .models import Role

KINDS = ('on', 'off', 'reset')


def mfa_email(kind: str, user, *, by=None) -> tuple[str, Email]:
    """The subject and the email. `by` is the admin who reset it, for the `reset` kind."""
    if kind not in KINDS:
        raise ValueError(f'kind must be one of {KINDS}')
    lang = user.preferred_language if user.preferred_language in WORDS else 'en'
    words = WORDS[lang]
    subject = words[f'mfa_{kind}_subject']
    if kind == 'reset':
        # An admin has to set it up again to get in. Anyone else may, and signs in with the password until then.
        after = words['mfa_reset_admin' if user.role == Role.ADMIN else 'mfa_reset_again']
        intro = (words['mfa_reset_intro'].format(name=by.name, email=by.email), after)
    else:
        intro = (words[f'mfa_{kind}_intro'],)
    return subject, Email(
        heading=subject,
        greeting=words['mfa_greeting'].format(name=user.name),
        intro=intro,
        closing=(words[f'mfa_{kind}_closing'],),
        reason=words['mfa_reason'],
        lang=lang,
    )
