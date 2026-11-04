import logging

from core.net import get_client_ip
from core.request_id import current_request_id

from .models import AuditLog

logger = logging.getLogger(__name__)


def _device_label(request) -> str:
    """The name of the device the request came from, when it came with a sign in that has one."""
    session_id = getattr(request, 'session_id', None)
    if not session_id:
        return ''
    from users.models import UserSession
    return UserSession.objects.filter(pk=session_id).values_list('device_label', flat=True).first() or ''


def on_behalf_of(request, farm):
    """The farm's owner when somebody else is making the change, else None. Pass it as owner= to log_action."""
    return farm.owner if farm.owner_id != getattr(request.user, 'pk', None) else None


def log_action(request, action: str, resource: str, resource_id='', detail='', actor=None, owner=None,
               changes=None, outcome='success') -> None:
    """Write one audit entry inside the request. Safe to call from any view.

    Pass actor= when request.user is still AnonymousUser (e.g. during login).
    Pass owner= when the change is to data somebody else owns, such as an admin editing a farmer's farm. The entry then
    says "on behalf of" and the owner's email, so it is not read as the owner's own doing.
    Pass changes= (from audit_log.changes.build_changes) to record what each field was and became.
    A failure is logged and swallowed, so auditing never breaks the request it describes.
    """
    user       = actor or getattr(request, 'user', None)
    is_auth    = user and getattr(user, 'is_authenticated', False) and not getattr(user, 'is_anonymous', True)
    on_behalf = ''
    if owner is not None and getattr(owner, 'email', '') and (not is_auth or owner.pk != user.pk):
        on_behalf = owner.email
        detail = f'{detail} (on behalf of {on_behalf})'
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
            request_id = current_request_id(),
            changes    = changes or {},
            device_label = _device_label(request) if is_auth else '',
            on_behalf_of_email = on_behalf,
            outcome    = outcome,
        )
    except Exception:
        logger.exception('Could not write the audit entry %s %s %s', action, resource, resource_id)
