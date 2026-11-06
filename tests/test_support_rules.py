"""What an admin acting as a person may do. Anything not written down is refused.

The edit list below is a copy kept in this file on purpose: it is the list the owner reviewed. If the code list changes,
this test fails until a person has decided that the change is meant.
"""
import pytest
from rest_framework.test import APIClient

from core import support_rules
from core.support_rules import BLOCKED, VIEW_ONLY, decide
from logs.models import SecurityEvent
from tests.factories import FarmFactory
from tests.security.test_permission_walk import VIEWS, action_of
from tests.support_helpers import acting, admin_and_person

pytestmark = pytest.mark.django_db

REVIEWED_EDIT_PAIRS = {
    ('farms', 'create'), ('farms', 'update'),
    ('rooms', 'create'), ('rooms', 'update'),
    ('batches', 'create'), ('batches', 'update'), ('batches', 'move_room'), ('batches', 'advance_stage'),
    ('mortality', 'create'),
    ('harvests', 'create'),
    ('detections', 'create'), ('detections', 'feedback'),
    ('readings', 'create'),
    ('devices', 'create'), ('devices', 'update'),
    ('alerts', 'mark_read'), ('alerts', 'mark_all_read'),
    ('alert_acknowledgements', 'create'),
    ('alert_comments', 'create'),
}


def client_for(token):
    client = APIClient(raise_request_exception=False)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


# ── the rule on its own ───────────────────────────────────────────────────────

def test_the_edit_list_is_the_one_that_was_reviewed():
    assert set(support_rules.EDIT_PAIRS) == REVIEWED_EDIT_PAIRS
    assert len(REVIEWED_EDIT_PAIRS) == 19


def test_view_only_allows_reads_and_refuses_every_write():
    assert decide('farms', 'read', 'GET', 'view') is None
    assert decide('farms', 'read', 'HEAD', 'view') is None
    for method in ('POST', 'PATCH', 'PUT', 'DELETE'):
        assert decide('farms', 'update', method, 'view') == VIEW_ONLY


def test_a_read_only_post_is_allowed_in_view_mode():
    # Looking a place up, and the activity ping, are POSTs that change nothing the person owns.
    assert decide('locations', 'locate', 'POST', 'view') is None
    assert decide('account', 'ping', 'POST', 'view') is None


@pytest.mark.parametrize('pair', sorted(REVIEWED_EDIT_PAIRS))
def test_edit_mode_allows_each_reviewed_pair_and_view_mode_does_not(pair):
    assert decide(*pair, 'POST', 'edit') is None
    assert decide(*pair, 'POST', 'view') == VIEW_ONLY


@pytest.mark.parametrize('pair', [
    ('farms', 'delete'), ('rooms', 'delete'), ('batches', 'delete'), ('mortality', 'delete'), ('harvests', 'delete'),
    ('harvests', 'share'), ('devices', 'delete'), ('alert_comments', 'delete'), ('alerts', 'stream_ticket'),
    ('account', 'update'), ('account', 'delete'), ('account', 'revoke_others'),
    ('team', 'create'), ('team', 'delete'), ('invitations', 'accept'),
    ('cooperatives', 'update'), ('cooperatives', 'delete'), ('thresholds', 'update'),
])
def test_edit_mode_still_refuses_everything_else(pair):
    assert decide(*pair, 'POST', 'edit') == BLOCKED


@pytest.mark.parametrize('resource,action', [
    ('account', 'sessions'), ('support_access', 'read'), ('support_access', 'end_own'), ('support_access', 'respond'),
    ('second_factor', 'read'), ('admin_users', 'read'), ('system_health', 'read'), ('audit_log', 'read'), ('logs', 'read'),
])
@pytest.mark.parametrize('mode', ['view', 'edit'])
def test_some_things_are_refused_even_to_look_at(resource, action, mode):
    assert decide(resource, action, 'GET', mode) == BLOCKED


def test_reading_the_profile_the_team_and_the_cooperative_stays_allowed():
    for pair in (('account', 'read'), ('team', 'read'), ('cooperatives', 'read'), ('farms', 'read')):
        assert decide(*pair, 'GET', 'view') is None


def test_an_unknown_route_is_refused():
    assert decide(None, None, 'GET', 'edit') == BLOCKED
    assert decide('nothing_like_this', 'read', 'POST', 'edit') == BLOCKED


# ── every route in the API ────────────────────────────────────────────────────

WRITES = ('post', 'put', 'patch', 'delete')


@pytest.mark.parametrize('name', sorted(n for n, (_, __, cls) in VIEWS.items() if cls is not None))
def test_no_route_can_be_written_through_support_access_unless_it_was_reviewed(name):
    _, __, cls = VIEWS[name]
    resource = getattr(cls, 'resource', None)
    for method in WRITES:
        if not hasattr(cls, method):
            continue
        pair = (resource, action_of(cls, method))
        edit = decide(*pair, method.upper(), 'edit')
        view = decide(*pair, method.upper(), 'view')
        if pair in REVIEWED_EDIT_PAIRS:
            assert edit is None and view == VIEW_ONLY, f'{name}.{method} {pair}'
        elif pair in support_rules.SAFE_POSTS:
            assert edit is None and view is None, f'{name}.{method} {pair}'
        else:
            assert edit == BLOCKED and view in (VIEW_ONLY, BLOCKED), f'{name}.{method} {pair} was {edit}'


def test_a_function_view_is_refused():
    function_views = [n for n, (_, __, cls) in VIEWS.items() if cls is None]
    assert function_views, 'the walk should find the function views'
    assert decide(None, None, 'GET', 'edit') == BLOCKED


# ── through the real API ──────────────────────────────────────────────────────

def test_view_only_looks_but_does_not_change():
    admin, person = admin_and_person()
    farm = FarmFactory(owner=person)
    token, _ = acting(admin, person, mode='view')
    client = client_for(token)
    assert client.get('/api/farms').status_code == 200
    response = client.patch(f'/api/farms/{farm.pk}', {'name': 'Renamed'}, format='json')
    assert response.status_code == 403
    assert response.json()['code'] == 'support_view_only' and response.json()['message'] == 'Support access can only look, not change.'
    farm.refresh_from_db()
    assert farm.name != 'Renamed'


def test_edit_mode_changes_the_persons_own_farm_as_the_person():
    admin, person = admin_and_person()
    farm = FarmFactory(owner=person)
    token, _ = acting(admin, person, mode='edit')
    assert client_for(token).patch(f'/api/farms/{farm.pk}', {'name': 'Renamed'}, format='json').status_code == 200
    farm.refresh_from_db()
    assert farm.name == 'Renamed'


def test_edit_mode_reaches_only_what_the_person_could_reach():
    admin, person = admin_and_person()
    someone_elses = FarmFactory()
    token, _ = acting(admin, person, mode='edit')
    assert client_for(token).patch(f'/api/farms/{someone_elses.pk}', {'name': 'Taken'}, format='json').status_code in (403, 404)
    someone_elses.refresh_from_db()
    assert someone_elses.name != 'Taken'


def test_edit_mode_cannot_delete_or_change_the_password_or_see_the_devices():
    admin, person = admin_and_person()
    farm = FarmFactory(owner=person)
    token, _ = acting(admin, person, mode='edit')
    client = client_for(token)

    deleted = client.delete(f'/api/farms/{farm.pk}')
    assert deleted.status_code == 403 and deleted.json()['code'] == 'support_blocked'
    changed = client.patch('/api/auth/change-password', {
        'current_password': 'Pass1234', 'new_password': 'NewPass123', 'confirm_password': 'NewPass123',
    }, format='json')
    assert changed.status_code == 403 and changed.json()['code'] == 'support_blocked'
    assert client.get('/api/auth/sessions').json()['code'] == 'support_blocked'
    assert client.post('/api/auth/logout').status_code == 403
    assert client.get('/api/admin/users').status_code == 403
    farm.refresh_from_db()
    person.refresh_from_db()
    assert farm.is_active and person.check_password('Pass1234')


def test_the_ping_that_counts_as_activity_still_works_in_view_mode():
    admin, person = admin_and_person('SUPERVISOR')
    token, _ = acting(admin, person, mode='view')
    assert client_for(token).post('/api/auth/session/ping').status_code == 200


def test_a_refusal_is_written_as_a_security_event_naming_the_admin_and_not_as_a_role_refusal():
    admin, person = admin_and_person()
    farm = FarmFactory(owner=person)
    token, _ = acting(admin, person, mode='view')
    client_for(token).patch(f'/api/farms/{farm.pk}', {'name': 'Renamed'}, format='json')
    event = SecurityEvent.objects.get(kind='support_refused')
    assert event.user_id == admin.pk and event.detail.startswith(f'as {person.email}:') and 'farms.update' in event.detail
    assert not SecurityEvent.objects.filter(kind='permission_denied').exists()
