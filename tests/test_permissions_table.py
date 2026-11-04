"""One table says which role may do what. A view names its resource and the permission class reads the table."""
from types import SimpleNamespace

import pytest
from rest_framework.test import APIRequestFactory

from core.permissions import RolePermission
from core.permissions_table import ADMIN, ALL, FARMER, PERMISSIONS, ROLES, SUPERVISOR, may

factory = APIRequestFactory()


def request_as(role, method='get'):
    request = getattr(factory, method)('/x')
    request.user = SimpleNamespace(is_authenticated=role is not None, role=role)
    return request


def view(resource, actions=None, handlers=('get', 'post', 'patch', 'put', 'delete')):
    attrs = {name: (lambda *a, **k: None) for name in handlers}
    attrs['resource'] = resource
    if actions is not None:
        attrs['actions'] = actions
    return type('FakeView', (), attrs)()


def test_the_roles_are_the_three_we_have():
    assert ROLES == (FARMER, SUPERVISOR, ADMIN)
    assert ALL == frozenset(ROLES)


def test_every_entry_names_real_roles_and_a_plain_word_for_the_action():
    for resource, actions in PERMISSIONS.items():
        assert actions, resource
        for action, roles in actions.items():
            assert roles and set(roles) <= set(ROLES), (resource, action)
            assert action.replace('_', '').isalpha() and action == action.lower(), (resource, action)


def test_may_answers_from_the_table():
    assert may(ADMIN, 'farms', 'create') is True
    assert may(SUPERVISOR, 'farms', 'create') is False


def test_may_refuses_what_the_table_does_not_know():
    assert may(ADMIN, 'no_such_resource', 'read') is False
    assert may(ADMIN, 'farms', 'no_such_action') is False
    assert may('SOMEONE_ELSE', 'farms', 'read') is False
    assert may(None, 'farms', 'read') is False


@pytest.mark.parametrize('method, action', [('get', 'read'), ('post', 'create'), ('patch', 'update'), ('put', 'update'), ('delete', 'delete')])
def test_a_method_means_the_obvious_action_unless_the_view_says_otherwise(method, action):
    for role in ROLES:
        expected = may(role, 'farms', action)
        assert RolePermission().has_permission(request_as(role, method), view('farms')) is expected


def test_a_view_can_name_the_action_of_a_method():
    risky = view('farms', actions={'get': 'risk'})
    assert RolePermission().has_permission(request_as(SUPERVISOR), risky) is True
    assert RolePermission().has_permission(request_as(FARMER), risky) is False


def test_a_view_with_no_resource_is_refused_rather_than_let_through():
    assert RolePermission().has_permission(request_as(ADMIN), view(None)) is False


def test_an_action_missing_from_the_table_is_refused():
    odd = view('farms', actions={'get': 'teleport'})
    assert RolePermission().has_permission(request_as(ADMIN), odd) is False


def test_a_method_the_view_does_not_have_is_left_to_answer_405():
    only_get = view('farms', handlers=('get',))
    assert RolePermission().has_permission(request_as(FARMER, 'delete'), only_get) is True


def test_a_stranger_is_not_let_through_here():
    assert RolePermission().has_permission(request_as(None), view('farms')) is False


def test_the_refusal_is_in_plain_words():
    assert RolePermission.message == "You don't have permission to do that."
