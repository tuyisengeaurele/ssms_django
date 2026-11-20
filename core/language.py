"""The language a request asks for, from its Accept-Language header.

The web sends the language chosen in the picker. English, French and Kinyarwanda are served; anything else, or no header,
means English. The language is on the request as `request.language` and, for code that has no request in hand (the error
answers), in `current_language()` for the length of the call.
"""
from contextvars import ContextVar

LANGS = ('en', 'fr', 'rw')
# Some systems name Kinyarwanda by its three letter code.
_ALIASES = {'kin': 'rw'}
# A header is read only as far as it is plausible: a client cannot make the server parse a long list.
_MAX_HEADER = 500
_MAX_ENTRIES = 20

_current: ContextVar[str] = ContextVar('language', default='en')


def current_language() -> str:
    """The language of the request being answered right now, or English outside a request."""
    return _current.get()


def language_from_header(value) -> str:
    """The best language we have among those the header asks for, by weight and then by place. English when none."""
    if not isinstance(value, str):
        return 'en'
    best, best_weight = 'en', 0.0
    for part in value[:_MAX_HEADER].split(',')[:_MAX_ENTRIES]:
        tag, _, rest = part.strip().partition(';')
        primary = tag.strip().lower().split('-')[0]
        lang = _ALIASES.get(primary, primary)
        if lang not in LANGS:
            continue
        weight = 1.0
        rest = rest.strip().lower()
        if rest:
            name, _, number = rest.partition('=')
            try:
                weight = float(number) if name.strip() == 'q' else 1.0
            except ValueError:
                weight = 0.0
        if weight > best_weight:
            best, best_weight = lang, weight
    return best


class LanguageMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.language = language_from_header(request.META.get('HTTP_ACCEPT_LANGUAGE'))
        token = _current.set(request.language)
        try:
            return self.get_response(request)
        finally:
            _current.reset(token)
