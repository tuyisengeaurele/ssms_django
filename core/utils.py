from django.http import JsonResponse
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


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    status_code = response.status_code
    data = response.data

    if status_code == 401:
        message = 'Access denied. No token provided or token is invalid.'
    elif status_code == 403:
        message = 'Forbidden. Insufficient permissions.'
    elif status_code == 404:
        message = 'Resource not found.'
    elif status_code == 405:
        message = 'Method not allowed.'
    elif isinstance(data, dict) and 'detail' in data:
        message = str(data['detail'])
    else:
        message = 'An error occurred.'

    errors = None
    if isinstance(data, dict) and any(k != 'detail' for k in data):
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
