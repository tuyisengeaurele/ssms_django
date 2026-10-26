import logging

from core.net import get_client_ip

from .models import AuditLog

logger = logging.getLogger(__name__)


def log_action(request, action: str, resource: str, resource_id='', detail='', actor=None) -> None:
    """Write one audit entry inside the request. Safe to call from any view.

    Pass actor= when request.user is still AnonymousUser (e.g. during login).
    A failure is logged and swallowed, so auditing never breaks the request it describes.
    """
    user       = actor or getattr(request, 'user', None)
    is_auth    = user and getattr(user, 'is_authenticated', False) and not getattr(user, 'is_anonymous', True)
    try:
        AuditLog.objects.create(
            user_id    = user.pk    if is_auth else None,
            user_email = user.email if is_auth else '',
            user_name  = getattr(user, 'name', '') if is_auth else '',
            action     = action,
            resource   = resource,
            resource_id= str(resource_id),
            detail     = detail,
            ip_address = get_client_ip(request),
        )
    except Exception:
        logger.exception('Could not write the audit entry %s %s %s', action, resource, resource_id)
