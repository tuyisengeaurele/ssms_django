"""Reading query parameters without crashing on bad input.

A request like ?hours=abc used to end in a 500. These helpers turn it into a 422 that says what to fix.
"""
import re
from datetime import date

from rest_framework.exceptions import APIException

_WHOLE_NUMBER = re.compile(r'[0-9]+')  # ASCII digits only: no signs, spaces, decimals or other scripts
_ISO_DATE = re.compile(r'\d{4}-\d{2}-\d{2}')


class ParamError(APIException):
    status_code = 422
    default_code = 'invalid_param'


def int_param(request, name: str, default: int, minimum: int, maximum: int) -> int:
    raw = request.query_params.get(name)
    if raw is None or raw == '':
        return default
    if not _WHOLE_NUMBER.fullmatch(raw) or not minimum <= int(raw) <= maximum:
        raise ParamError(f'Please send a whole number from {minimum} to {maximum} for "{name}".')
    return int(raw)


def date_param(request, name: str) -> date | None:
    raw = request.query_params.get(name)
    if raw is None or raw == '':
        return None
    try:
        if not _ISO_DATE.fullmatch(raw):
            raise ValueError
        return date.fromisoformat(raw)
    except ValueError:
        raise ParamError(f'Please send "{name}" as a date like 2026-10-31.') from None
