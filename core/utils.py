import math

from django.http import JsonResponse
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated, ParseError, Throttled
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def api_success(data=None, message='Success', status_code=status.HTTP_200_OK):
    return Response({'success': True, 'message': message, 'data': data}, status=status_code)


def api_error(message='Error', status_code=status.HTTP_400_BAD_REQUEST, errors=None):
    body = {'success': False, 'message': message}
    if errors is not None:
        body['errors'] = errors
    return Response(body, status=status_code)


def _friendly_message(exc, status_code, data):
    """Plain, kind wording for every error the API can raise."""
    if isinstance(exc, Throttled):
        if exc.wait:
            seconds = int(math.ceil(exc.wait))
            unit = 'second' if seconds == 1 else 'seconds'
            return f'Too many attempts. Please try again in {seconds} {unit}.'
        return 'Too many attempts. Please wait a moment and try again.'
    if isinstance(exc, AuthenticationFailed) and getattr(exc.detail, 'code', '') == 'user_inactive':
        return 'This account has been turned off. Please contact your administrator.'
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

    response.data = {'success': False, 'message': message}
    if errors:
        response.data['errors'] = errors

    return response


def health_check(request):
    from django.utils import timezone
    from django.db import connection

    # Verify the database is reachable — Render uses this endpoint to route
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
