"""Phone numbers: only a Rwandan mobile number, kept as E.164 (+250 and nine digits)."""
import re

from django.core.exceptions import ValidationError

# Airtel 72, 73 and MTN 78, 79. Landlines and the other ranges are not texted.
_MOBILE = re.compile(r'^\+250(7[2389][0-9]{7})$')
_SEPARATORS = re.compile(r'[\s\-().]')


def normalize_rwanda_mobile(text: str) -> str:
    """'0788 123 456', '788123456', '250788123456' and '+250788123456' all become '+250788123456'. Anything else is refused."""
    cleaned = _SEPARATORS.sub('', text or '')
    if cleaned.startswith('+'):
        candidate = cleaned
    elif cleaned.startswith('250'):
        candidate = '+' + cleaned
    elif cleaned.startswith('0'):
        candidate = '+250' + cleaned[1:]
    else:
        candidate = '+250' + cleaned
    if not _MOBILE.match(candidate):
        raise ValidationError('Enter a Rwandan mobile number, for example 0788 123 456.', code='invalid_phone')
    return candidate
