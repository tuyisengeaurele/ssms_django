"""An account with no phone number can sign in and give one, and can do nothing else until it does.

Every account has a number. Accounts made before that rule have none, and the SSMS team can clear a number, so the check
runs on each request, in the authentication class: a view that sets its own permission classes cannot skip it.
"""
from django.urls import Resolver404, resolve
from rest_framework.exceptions import PermissionDenied

# The routes a person without a number still needs: to see who they are, to save the number, to stay signed in and to sign out.
# A route that is not here is refused. tests/test_phone_gate.py walks every route and fails on a name that matches nothing.
# The token refresh and the sign in steps of the second factor do not use this login (the cookie or a challenge carries them), so
# the gate never meets them.
OPEN_URL_NAMES = frozenset({
    'auth_me', 'auth_logout', 'auth_session_ping', 'auth_mfa_status', 'auth_mfa_recovery_codes', 'auth_mfa_step_up',
})

MESSAGE = 'Please add your phone number to continue.'


def check_phone_on_file(request, user) -> None:
    """Refuse the request when the person has no number, unless the route is one of the open ones."""
    if user.phone:
        return
    try:
        name = resolve(request.path_info).url_name
    except Resolver404:
        return   # an address the API does not have: the 404 answer is the right one
    if name in OPEN_URL_NAMES:
        return
    raise PermissionDenied(MESSAGE, code='phone_required')
