"""Two reasons an account can reach nothing but a screen of its own.

An account with no phone number can sign in and give one, and can do nothing else until it does. Every account has a number:
accounts made before that rule have none, and the SSMS team can clear a number.

An account whose owner asked to close it can sign in and see its closure screen, where they keep the account or sign out, and can
do nothing else while the closure is scheduled. The reason about the closure comes first: the number can wait.

The check runs on each request, in the authentication class: a view that sets its own permission classes cannot skip it.
"""
from django.urls import Resolver404, resolve
from rest_framework.exceptions import PermissionDenied

# The routes a person without a number still needs: to see who they are, to save the number, to stay signed in and to sign out.
# A route that is not here is refused. tests/test_phone_gate.py walks every route and fails on a name that matches nothing.
# The token refresh and the sign in steps of the second factor do not use this login (the cookie or a challenge carries them), so
# the gate never meets them.
OPEN_URL_NAMES = frozenset({
    'auth_me', 'auth_logout', 'auth_session_ping', 'auth_mfa_status', 'auth_mfa_recovery_codes', 'auth_mfa_step_up',
    # A notice from the team, such as maintenance, is for everybody, whatever screen they are held at.
    'announcements_current',
})

# The routes an account with a scheduled closure still needs: to see its date, to stay signed in, to sign out, and to keep the account.
DELETION_OPEN_URL_NAMES = frozenset({'auth_me', 'auth_logout', 'auth_session_ping', 'auth_delete_account_cancel', 'announcements_current'})

PHONE_MESSAGE = 'Please add your phone number to continue.'
DELETION_MESSAGE = 'This account is scheduled to be removed. Keep it to continue.'


def check_account_gate(request, user) -> None:
    """Refuse the request when the account is scheduled for removal or has no number, unless the route is one of the open ones."""
    closing = user.deletion_requested_at is not None
    if not closing and user.phone:
        return
    try:
        name = resolve(request.path_info).url_name
    except Resolver404:
        return   # an address the API does not have: the 404 answer is the right one
    # A route with no name is in no list, so it is refused like any other that is not open.
    if closing:
        if name in DELETION_OPEN_URL_NAMES:
            return
        raise PermissionDenied(DELETION_MESSAGE, code='deletion_scheduled')
    if name in OPEN_URL_NAMES:
        return
    raise PermissionDenied(PHONE_MESSAGE, code='phone_required')
