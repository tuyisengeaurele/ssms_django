import math

from django.http import JsonResponse
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated, ParseError, Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .error_text import CODE_KEYS, error_text
from .language import current_language
from .request_id import current_request_id


def api_success(data=None, message='Success', status_code=status.HTTP_200_OK):
    return Response({'success': True, 'message': message, 'data': data}, status=status_code)


def localize_errors(errors, lang):
    """A serializer's field errors with each sentence that has a code of ours written in `lang`, and the first such code.

    The code travels on the error itself (serializers.ValidationError(text, code='email_taken')). Django REST framework's own
    codes ('required', 'invalid') are not ours and are left as they are."""
    if not isinstance(errors, dict):
        return errors, None
    found, out = None, {}
    for field, value in errors.items():
        items = value if isinstance(value, (list, tuple)) else [value]
        written = []
        for item in items:
            code = getattr(item, 'code', None)
            if code in CODE_KEYS:
                found = found or code
                item = error_text(code, lang)
            written.append(item)
        out[field] = written if isinstance(value, (list, tuple)) else written[0]
    return out, found


def api_error(message='Error', status_code=status.HTTP_400_BAD_REQUEST, errors=None, code=None):
    """An error answer. A `code` of ours says which sentence is meant: the sentence is then written in the language of the request
    (English when it asked for none), and the web translates the code by itself. Without a code the message goes as given."""
    lang = current_language()
    if code in CODE_KEYS:
        message = error_text(code, lang)
    if errors is not None:
        errors, found = localize_errors(errors, lang)
        code = found or code   # the case a field names is more exact than the general one
    body = {'success': False, 'message': message, 'reference': current_request_id()}
    if errors is not None:
        body['errors'] = errors
    if code is not None:
        # A short name the page can tell cases apart by, as it does for the second factor and support access.
        body['code'] = code
    return Response(body, status=status_code)


# Codes of support access that the page needs, besides the second factor ones.
SUPPORT_CODES = ('support_ended', 'support_view_only', 'support_blocked')


def _failure_code(exc) -> str:
    """The code an authentication class gave. The token library keeps it in a dict, Django REST framework on the text."""
    detail = getattr(exc, 'detail', None)   # a plain Django 404 has none
    code = detail.get('code') if isinstance(detail, dict) else getattr(detail, 'code', '')
    return str(code or '')


def _answer(exc, status_code, data, lang):
    """(sentence, code) for an error. The code is None for the answers a page handles by a code of its own."""
    if isinstance(exc, Throttled):
        wait = int(math.ceil(exc.wait)) if exc.wait else None
        return error_text('throttled', lang, n=wait), 'throttled'
    if isinstance(exc, AuthenticationFailed) and getattr(exc.detail, 'code', '') == 'user_inactive':
        return error_text('inactive_account', lang), 'inactive_account'
    if isinstance(exc, NotAuthenticated):
        return error_text('not_authenticated', lang), 'not_authenticated'
    if status_code == 403 and _failure_code(exc) == 'mfa_recent_required':
        return 'Please confirm with a code from your authenticator app.', None
    code = _failure_code(exc)
    if code in ('phone_required', 'deletion_scheduled'):
        return error_text(code, lang), code
    if code == 'support_ended':
        return 'The support session has ended.', None
    if code == 'support_view_only':
        return 'Support access can only look, not change.', None
    if code == 'support_blocked':
        return 'Support access cannot do that.', None
    named = None
    if status_code == 401:
        named = 'session_ended'
    elif status_code == 403:
        named = 'forbidden'
    elif status_code == 404:
        named = 'not_found'
    elif status_code == 405:
        named = 'method_not_allowed'
    elif isinstance(exc, ParseError):
        named = 'bad_request'
    if named:
        return error_text(named, lang), named
    if isinstance(data, dict) and 'detail' in data:
        return str(data['detail']), None
    return error_text('something_wrong', lang), 'something_wrong'


def _note_refusal(exc, context, status_code):
    """A refusal for the role, or a slow down, goes in the security log. Only the method and the route pattern, never the query."""
    # Asking for a code, and the refusals of support access (which write their own event), are not a refusal for the role.
    asking_for_a_code = status_code == 403 and _failure_code(exc) in ('mfa_recent_required', 'phone_required', 'deletion_scheduled', *SUPPORT_CODES)
    kind = 'throttled' if isinstance(exc, Throttled) else 'permission_denied' if status_code == 403 and not asking_for_a_code else None
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
    lang = current_language()
    message, named = _answer(exc, status_code, data, lang)

    # Sign in problems carry token internals. People do not need to see those.
    errors = None
    if status_code not in (401, 403) and isinstance(data, dict) and any(k != 'detail' for k in data):
        errors = {k: v for k, v in data.items() if k != 'detail'}

    response.data = {'success': False, 'message': message, 'reference': current_request_id()}
    _note_refusal(exc, context, status_code)
    if isinstance(exc, AuthenticationFailed) and _failure_code(exc) == 'session_idle':
        response.data['code'] = 'session_idle'
    if _failure_code(exc) in ('mfa_required', 'mfa_recent_required', *SUPPORT_CODES):
        response.data['code'] = _failure_code(exc)
    if isinstance(exc, Throttled) and exc.wait:
        response.data['retryAfter'] = int(math.ceil(exc.wait))
    if errors:
        errors, from_field = localize_errors(errors, lang)
        response.data['errors'] = errors
        named = named or from_field
    # A code the page already handles (an idle session, the second factor, support access) is kept as it is set above.
    if named and 'code' not in response.data:
        response.data['code'] = named

    return response


def not_found(request, exception=None):
    """An address the API does not have. Plain JSON, like every other answer, with the reference."""
    return JsonResponse(
        {'success': False, 'message': error_text('not_found', current_language()), 'code': 'not_found', 'reference': current_request_id()},
        status=404,
    )


def server_error(request):
    """Something broke. Nothing about what is said, only that it happened and the reference to find it by."""
    return JsonResponse(
        {'success': False, 'message': error_text('server_error', current_language()), 'code': 'server_error', 'reference': current_request_id()},
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
