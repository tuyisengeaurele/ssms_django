"""Phone numbers: only a Rwandan mobile number, kept as E.164 (+250 and nine digits)."""
import re

from django.core.exceptions import ValidationError

# Airtel 72, 73 and MTN 78, 79. Landlines and the other ranges are not texted.
_MOBILE = re.compile(r'^\+250(7[2389][0-9]{7})$')
_SEPARATORS = re.compile(r'[\s\-().]')


def normalize_rwanda_mobile(text: str) -> str:
    """'0788123456', '788123456', '250788123456' and '+250788123456' all become '+250788123456'. Anything else is refused."""
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
        raise ValidationError('Enter a Rwandan mobile number, for example 0788123456.', code='invalid_phone')
    return candidate


def phone_in_use(number: str, exclude_user_id: str | None = None) -> bool:
    """Whether another account already holds this number. The database rule is the real guard, this is the friendly check before it."""
    from django.contrib.auth import get_user_model
    others = get_user_model().objects.filter(phone=number)
    if exclude_user_id:
        others = others.exclude(pk=exclude_user_id)
    return others.exists()


def same_number(typed, stored) -> bool:
    """Whether what a person typed is the number we hold, whichever way they wrote it. Text that is not a number is not the same."""
    try:
        return bool(stored) and normalize_rwanda_mobile(typed) == stored
    except ValidationError:
        return False


def describe_change(old, new) -> str:
    """'+250*****456 to +250*****000', for the security log. A missing number reads 'none'."""
    return f'{mask_phone(old) if old else "none"} to {mask_phone(new) if new else "none"}'


def mask_phone(number: str) -> str:
    """'+250788123456' becomes '+250*****456', for the logs: enough to tell numbers apart, not enough to call."""
    return f'{number[:4]}*****{number[-3:]}' if number and len(number) > 7 else '***'
