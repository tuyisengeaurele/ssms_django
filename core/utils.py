import math

from django.http import JsonResponse
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated, ParseError, Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .request_id import current_request_id


def api_success(data=None, message='Success', status_code=status.HTTP_200_OK):
    return Response({'success': True, 'message': message, 'data': data}, status=status_code)


def api_error(message='Error', status_code=status.HTTP_400_BAD_REQUEST, errors=None):
    body = {'success': False, 'message': message, 'reference': current_request_id()}
    if errors is not None:
        body['errors'] = errors
    return Response(body, status=status_code)


def _failure_code(exc) -> str:
    """The code an authentication class gave. The token library keeps it in a dict, Django REST framework on the text."""
    detail = exc.detail
    code = detail.get('code') if isinstance(detail, dict) else getattr(detail, 'code', '')
    return str(code or '')


def _friendly_message(exc, status_code, data):
    """Plain, kind wording for every error the API can raise."""
    if isinstance(exc, Throttled):
        if exc.wait:
            seconds = int(math.ceil(exc.wait))
            unit = 'second' if seconds == 1 else 'seconds'
            return f'Too many attempts. Please try again in {seconds} {unit}.'
        return 'Too many attempts. Please wait a moment and try again.'
    if isinstance(exc, AuthenticationFailed) and getattr(exc.detail, 'code', '') == 'user_inactive':
        return 'This account has been deleted. Please contact the SSMS team.'
    if isinstance(exc, NotAuthenticated):
        return 'Please sign in to continue.'
    if status_code == 401:
        return 'Your session has ended. Please sign in again.'
    if status_code == 403:
        return "You don't have permission to do that."
    if status_code == 404:
        return "We couldn't find what you were looking for."
    if status_code == 405:
        return "That action isn't available here."
    if isinstance(exc, ParseError):
        return "We couldn't read that request. Please check it and try again."
    if isinstance(data, dict) and 'detail' in data:
        return str(data['detail'])
    return 'Something went wrong. Please try again.'


def _note_refusal(exc, context, status_code):
    """A refusal for the role, or a slow down, goes in the security log. Only the method and the route pattern, never the query."""
    kind = 'throttled' if isinstance(exc, Throttled) else 'permission_denied' if status_code == 403 else None
    request = context.get('request')
    if kind and request is not None:
        from logs.security import record_security_event
        match = getattr(request, 'resolver_match', None)
        record_security_event(kind, request, detail=f"{request.method} {getattr(match, 'route', '') or '(unmatched)'}")


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    status_code = response.status_code
    data = response.data
    message = _friendly_message(exc, status_code, data)

    # Sign in problems carry token internals. People do not need to see those.
    errors = None
    if status_code not in (401, 403) and isinstance(data, dict) and any(k != 'detail' for k in data):
        errors = {k: v for k, v in data.items() if k != 'detail'}

    response.data = {'success': False, 'message': message, 'reference': current_request_id()}
    _note_refusal(exc, context, status_code)
    if isinstance(exc, AuthenticationFailed) and _failure_code(exc) == 'session_idle':
        response.data['code'] = 'session_idle'
    if isinstance(exc, Throttled) and exc.wait:
        response.data['retryAfter'] = int(math.ceil(exc.wait))
    if errors:
        response.data['errors'] = errors

    return response


def not_found(request, exception=None):
    """An address the API does not have. Plain JSON, like every other answer, with the reference."""
    return JsonResponse(
        {'success': False, 'message': "We couldn't find what you were looking for.", 'reference': current_request_id()},
        status=404,
    )


def server_error(request):
    """Something broke. Nothing about what is said, only that it happened and the reference to find it by."""
    return JsonResponse(
        {'success': False, 'message': 'Something went wrong on our side. Please try again in a moment.', 'reference': current_request_id()},
        status=500,
    )


def health_check(request):
    from django.db import connection
    from django.utils import timezone

    # Verify the database is reachable, Render uses this endpoint to route
    # traffic; return 503 so unhealthy instances are taken out of rotation.
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        db_ok = True
    except Exception:
        db_ok = False

    status_code = 200 if db_ok else 503
    return JsonResponse(
        {
            'status':    'ok' if db_ok else 'degraded',
            'database':  'ok' if db_ok else 'unreachable',
            'timestamp': timezone.now().isoformat(),
        },
        status=status_code,
    )


def body_field(data, *names, default=''):
    """The first of these names present in a request body.

    The JSON parser turns camelCase names into snake_case (newPassword becomes new_password), but
    form bodies keep them as sent. Passing both spellings reads either.
    """
    for name in names:
        value = data.get(name)
        if value is not None:
            return value
    return default
