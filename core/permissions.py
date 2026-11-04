from rest_framework.permissions import BasePermission

from .permissions_table import may

# What a method means unless the view says otherwise in `actions`.
DEFAULT_ACTIONS = {'get': 'read', 'post': 'create', 'put': 'update', 'patch': 'update', 'delete': 'delete'}


class RolePermission(BasePermission):
    """Lets a request through when the table in `core.permissions_table` allows the caller's role.

    The view names its `resource`, and optionally `actions`, a dict from method to action for the methods that do
    not mean the obvious thing. Use it after IsAuthenticated, so a stranger is told to sign in (401) and not refused (403).
    """

    message = "You don't have permission to do that."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        method = request.method.lower()
        if method in ('head', 'options'):
            method = 'get'
        # A method the view does not have is answered "not allowed" (405) by the framework after this check.
        if not hasattr(view, method):
            return True
        action = (getattr(view, 'actions', None) or {}).get(method) or DEFAULT_ACTIONS.get(method)
        return may(user.role, getattr(view, 'resource', None), action)
