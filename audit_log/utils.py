import threading
from .models import AuditLog


def _get_ip(request) -> str | None:
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def log_action(request, action: str, resource: str, resource_id='', detail='', actor=None):
    """Fire-and-forget audit entry. Safe to call from any view.

    Pass actor= when request.user is still AnonymousUser (e.g. during login).
    """
    user       = actor or getattr(request, 'user', None)
    is_auth    = user and getattr(user, 'is_authenticated', False) and not getattr(user, 'is_anonymous', True)
    user_id    = user.pk    if is_auth else None
    user_email = user.email if is_auth else ''
    user_name  = getattr(user, 'name', '') if is_auth else ''
    ip         = _get_ip(request)

    def _write():
        AuditLog.objects.create(
            user_id    = user_id,
            user_email = user_email,
            user_name  = user_name,
            action     = action,
            resource   = resource,
            resource_id= str(resource_id),
            detail     = detail,
            ip_address = ip,
        )

    threading.Thread(target=_write, daemon=True).start()
