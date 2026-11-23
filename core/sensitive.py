"""The pieces every sensitive action shares: a typed confirmation, the password, one kind of refusal, and a slow down.

Changing an email, closing an account and downloading the data all ask the person to type something and to give their
password again, the way GitHub and Render do before something that cannot be taken back. The server checks both, so the
dialog in the page is never the only guard. A refusal is a 422 with a code on the field it is about, so the page can say it
beside the right box in the person's language.
"""
from rest_framework.exceptions import ErrorDetail, ValidationError

from .throttles import SensitiveRateThrottle  # noqa: F401  (the routes import it from here, with the rest)
from .utils import api_error

CONFIRM_TEXT = 'Type it exactly as shown to confirm.'
WRONG_PASSWORD = 'That password is not right.'


def require_typed(typed, expected, field: str = 'confirm_email', ignore_case: bool = True) -> None:
    """Refuse (code `confirm_mismatch`, on `field`) unless the typed text is the expected text, ignoring spaces at its ends and, by default, case."""
    given, wanted = str(typed or '').strip(), str(expected or '').strip()
    if ignore_case:
        given, wanted = given.lower(), wanted.lower()
    if not given or given != wanted:
        raise ValidationError({field: [ErrorDetail(CONFIRM_TEXT, code='confirm_mismatch')]})


def require_password(user, password, field: str = 'password') -> None:
    """Refuse (code `wrong_password`, on `field`) unless this is the person's password. An account with no usable password never passes."""
    if not password or not str(password).strip() or not user.check_password(password):
        raise ValidationError({field: [ErrorDetail(WRONG_PASSWORD, code='wrong_password')]})


def sensitive_error(code: str, text: str, field: str):
    """A 422 whose field error carries `code`. The sentence is written in the language of the request when the code is one of ours."""
    return api_error('Please check what you entered and try again.', 422, {field: [ErrorDetail(text, code=code)]}, code='invalid_input')


def mask_email(email) -> str:
    """'aline@example.rw' becomes 'a***@example.rw': enough to know which address, not enough to write to it. Anything else is '***'."""
    local, at, domain = str(email or '').partition('@')
    return f'{local[0]}***@{domain}' if local and at and domain else '***'
