"""A short reference for every request, so what a person sees can be found in the logs.

The reference goes back in the X-Request-ID header and in the body of every error. A reference sent by the caller is
kept when it is plain, so a load balancer's own id can follow a request through. Anything else is replaced: the value
ends up in logs and in a header, so it must never carry a line break or markup.
"""
import re
import uuid
from contextvars import ContextVar

HEADER = 'X-Request-ID'
META_KEY = 'HTTP_X_REQUEST_ID'
CLEAN = re.compile(r'^[A-Za-z0-9._-]{8,64}$')

_current: ContextVar[str] = ContextVar('request_id', default='')


def current_request_id() -> str:
    """The reference of the request being answered right now, or an empty string outside a request."""
    return _current.get()


def new_request_id() -> str:
    return uuid.uuid4().hex[:12].upper()


def clean_request_id(value) -> str:
    return value if isinstance(value, str) and CLEAN.match(value) else ''


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        reference = clean_request_id(request.META.get(META_KEY)) or new_request_id()
        request.request_id = reference
        token = _current.set(reference)
        try:
            response = self.get_response(request)
        finally:
            _current.reset(token)
        response[HEADER] = reference
        return response
