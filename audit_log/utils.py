import logging

from core.net import get_client_ip

from .models import AuditLog

logger = logging.getLogger(__name__)


def on_behalf_of(request, farm):
    """The farm's owner when somebody else is making the change, else None. Pass it as owner= to log_action."""
    return farm.owner if farm.owner_id != getattr(request.user, 'pk', None) else None


def log_action(request, action: str, resource: str, resource_id='', detail='', actor=None, owner=None) -> None:
    """Write one audit entry inside the request. Safe to call from any view.

    Pass actor= when request.user is still AnonymousUser (e.g. during login).
    Pass owner= when the change is to data somebody else owns, such as an admin editing a farmer's farm. The entry then
    says "on behalf of" and the owner's email, so it is not read as the owner's own doing.
    A failure is logged and swallowed, so auditing never breaks the request it describes.
    """
    user       = actor or getattr(request, 'user', None)
    is_auth    = user and getattr(user, 'is_authenticated', False) and not getattr(user, 'is_anonymous', True)
    if owner is not None and getattr(owner, 'email', '') and (not is_auth or owner.pk != user.pk):
        detail = f'{detail} (on behalf of {owner.email})'
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
