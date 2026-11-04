"""Every API endpoint is in the permission table, and the table and the endpoint agree.

The walk finds each view under /api. A new view with no entry fails here, so nobody can forget to say who may use it.
Then every role asks every view with every method it has. A role the table refuses must get 403, and a role it allows
must not.
"""
import re

import pytest
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.permissions import AllowAny
from rest_framework.test import APIClient

from core.permissions_table import PERMISSIONS, ROLES, may
from tests.factories import CooperativeFactory, UserFactory

pytestmark = pytest.mark.django_db

METHODS = ('get', 'post', 'put', 'patch', 'delete')
DEFAULT_ACTIONS = {'get': 'read', 'post': 'create', 'put': 'update', 'patch': 'update', 'delete': 'delete'}

# Open to anyone on purpose. Each one was read and is in this list, so a new open view has to be added here by hand.
PUBLIC = {
    'RegisterView', 'LoginView', 'LogoutView', 'CookieTokenRefreshView',
    'PasswordResetRequestView', 'PasswordResetConfirmView', 'VerifyEmailView', 'ResendVerificationView',
    'ContactCreateView', 'PublicLotView', 'InvitationDetailView', 'DeviceIngestView',
}

# Views that are not classes, so they carry their own check. Named here so a new one is noticed.
FUNCTION_VIEWS = {'health_check', 'alert_stream'}

# Allowed by the table, then refused by the view for a reason about the record, not the role.
REFUSES_ALLOWED_ROLE = {
    ('TeamInvitationListView', 'get'): 'a supervisor with no cooperative',
    ('TeamInvitationListView', 'post'): 'a supervisor with no cooperative',
    ('TeamInvitationDetailView', 'delete'): 'a supervisor with no cooperative',
    ('TeamFarmerListView', 'get'): 'a supervisor with no cooperative',
    ('TeamFarmerDetailView', 'delete'): 'a supervisor with no cooperative',
    ('AlertCommentDetailView', 'delete'): 'only the author or an admin may take a comment away',
}


def walk(patterns, prefix=''):
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from walk(entry.url_patterns, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            yield prefix + str(entry.pattern), entry


def api_views():
    seen = {}
    for route, entry in walk(get_resolver().url_patterns):
        if not route.startswith('api/'):
            continue
        view_class = getattr(entry.callback, 'view_class', None)
        name = view_class.__name__ if view_class else entry.callback.__name__
        seen.setdefault(name, (route, entry, view_class))
    return seen


VIEWS = api_views()
CLASS_VIEWS = {n: v for n, v in VIEWS.items() if v[2] is not None and n not in PUBLIC}


def url_for(route):
    """The route with a made up value in every placeholder. The role check runs before the value is looked at."""
    route = re.sub(r'<int:[^>]+>', '1', route.replace('^', '').replace('$', ''))
    return '/' + re.sub(r'<[^>]+>', 'x', route)


def action_of(cls, method):
    return getattr(cls, 'actions', {}).get(method) or DEFAULT_ACTIONS[method]


def test_the_walk_found_the_api():
    assert len(VIEWS) > 60


def test_every_open_view_is_one_we_decided_to_leave_open():
    opened = {
        n for n, (_, __, cls) in VIEWS.items()
        if cls is not None and any(isinstance(p, type) and issubclass(p, AllowAny) for p in getattr(cls, 'permission_classes', []))
    }
    assert opened == PUBLIC


def test_every_function_view_is_one_we_know_about():
    names = {n for n, (_, __, cls) in VIEWS.items() if cls is None}
    assert names == FUNCTION_VIEWS


@pytest.mark.parametrize('name', sorted(CLASS_VIEWS))
def test_the_view_is_in_the_table(name):
    _, __, cls = CLASS_VIEWS[name]
    resource = getattr(cls, 'resource', None)
    assert resource in PERMISSIONS, f'{name} has no entry in core/permissions_table.py'
    for method in METHODS:
        if hasattr(cls, method):
            action = action_of(cls, method)
            assert action in PERMISSIONS[resource], f'{name}.{method} asks for {resource}.{action}, which the table does not have'


def people():
    coop = CooperativeFactory()
    return {
        'FARMER': UserFactory(role='FARMER', cooperative=coop),
        'SUPERVISOR': UserFactory(role='SUPERVISOR', cooperative=coop),
        'ADMIN': UserFactory(role='ADMIN'),
    }


@pytest.mark.parametrize('name', sorted(CLASS_VIEWS))
def test_the_endpoint_gives_every_role_the_answer_the_table_gives(name):
    route, _, cls = CLASS_VIEWS[name]
    who = people()
    for method in METHODS:
        if not hasattr(cls, method):
            continue
        action = action_of(cls, method)
        for role in ROLES:
            client = APIClient(raise_request_exception=False)
            client.force_authenticate(user=who[role])
            response = getattr(client, method)(url_for(route), {}, format='json')
            if not may(role, cls.resource, action):
                assert response.status_code == 403, f'{name}.{method} let {role} through ({response.status_code})'
            elif (name, method) not in REFUSES_ALLOWED_ROLE:
                assert response.status_code != 403, f'{name}.{method} refused {role}, but the table allows it'
