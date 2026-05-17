import threading
from .models import AuditLog


def _get_ip(request) -> str | None:
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def log_action(request, action: str, resource: str, resource_id='', detail=''):
    """Fire-and-forget audit entry. Safe to call from any view."""
    user       = getattr(request, 'user', None)
    user_id    = user.pk   if user and user.is_authenticated else None
    user_email = user.email if user and user.is_authenticated else ''
    ip         = _get_ip(request)

    def _write():
        AuditLog.objects.create(
            user_id    = user_id,
            user_email = user_email,
            action     = action,
            resource   = resource,
            resource_id= str(resource_id),
            detail     = detail,
            ip_address = ip,
        )

    threading.Thread(target=_write, daemon=True).start()
