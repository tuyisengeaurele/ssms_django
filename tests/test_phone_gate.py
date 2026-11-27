"""An account with no phone number can sign in, but can reach nothing until it gives one. An account that is scheduled to be
closed can reach nothing until its owner keeps it or signs out.

The check runs in the authentication class, so it covers every view whatever permission classes the view sets for itself.
The tests sign in with a real token, because force_authenticate skips the authentication class.
"""
import re

import pytest
from django.urls import URLPattern, URLResolver, get_resolver
from django.utils import timezone

from core.account_gate import DELETION_OPEN_URL_NAMES, OPEN_URL_NAMES
from core.jwt_authentication import ActiveUserJWTAuthentication
from tests.factories import UserFactory
from tests.support_helpers import acting, admin_and_person

pytestmark = pytest.mark.django_db

ME = '/api/auth/me'


def gated(response):
    assert response.status_code == 403, response.content
    assert response.json()['code'] == 'phone_required'


def routes(patterns=None, prefix=''):
    """Every (path pattern, URLPattern) of the site."""
    for pattern in patterns if patterns is not None else get_resolver().url_patterns:
        route = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            yield from routes(pattern.url_patterns, route)
        elif isinstance(pattern, URLPattern):
            yield route, pattern


def concrete(route):
    """A path that matches the route: every <converter:name> becomes a value of that kind."""
    values = {'int': '1', 'uuid': '00000000-0000-0000-0000-000000000000'}
    return '/' + re.sub(r'<(?:(\w+):)?\w+>', lambda m: values.get(m.group(1), 'x'), route).lstrip('^').rstrip('$')


def uses_the_session_login(pattern):
    classes = getattr(getattr(pattern.callback, 'view_class', None), 'authentication_classes', None) or []
    return any(issubclass(c, ActiveUserJWTAuthentication) for c in classes)


# ── who is stopped ───────────────────────────────────────────────────────────────────────────

def test_a_person_without_a_number_is_refused_with_phone_required(jwt_client):
    person = UserFactory(phone=None)
    for url in ('/api/farms', '/api/alerts/batch/x', '/api/calendar'):
        gated(jwt_client(person).get(url))


def test_an_admin_without_a_number_is_refused_too(jwt_client):
    gated(jwt_client(UserFactory(role='ADMIN', phone=None)).get('/api/admin/users'))


def test_a_person_with_a_number_is_not_stopped(jwt_client):
    assert jwt_client(UserFactory()).get('/api/farms').status_code == 200


def test_the_answer_says_phone_required_in_the_language_asked_for(jwt_client):
    from core.doc_text import t
    response = jwt_client(UserFactory(phone=None)).get('/api/farms', HTTP_ACCEPT_LANGUAGE='fr')
    gated(response)
    assert response.json()['message'] == t('fr', 'erPhoneRequired')


def test_a_number_cleared_after_signing_in_stops_the_next_request(jwt_client):
    person = UserFactory()
    client = jwt_client(person)
    assert client.get('/api/farms').status_code == 200
    type(person).objects.filter(pk=person.pk).update(phone=None)
    gated(client.get('/api/farms'))


def test_the_gate_is_not_written_to_the_security_log_as_a_refusal_for_the_role(jwt_client):
    from logs.models import SecurityEvent
    gated(jwt_client(UserFactory(phone=None)).get('/api/farms'))
    assert not SecurityEvent.objects.filter(kind='permission_denied').exists()


# ── what stays open ──────────────────────────────────────────────────────────────────────────

def test_the_account_is_readable_and_the_gate_screen_can_save(jwt_client):
    person = UserFactory(phone=None)
    client = jwt_client(person)
    me = client.get(ME)
    assert me.status_code == 200
    assert me.json()['data']['phoneRequired'] is True
    saved = client.patch(ME, {'phone': '0788 123 456'}, format='json')
    assert saved.status_code == 200
    assert client.get(ME).json()['data']['phoneRequired'] is False
    assert client.get('/api/farms').status_code == 200


def test_a_person_without_a_number_can_still_sign_out(jwt_client):
    response = jwt_client(UserFactory(phone=None)).post('/api/auth/logout')
    assert response.status_code == 200


def test_a_person_with_a_number_has_phone_required_false(jwt_client):
    assert jwt_client(UserFactory()).get(ME).json()['data']['phoneRequired'] is False


def test_support_access_is_not_stopped_by_the_gate(jwt_client):
    from rest_framework.test import APIClient
    admin, person = admin_and_person()
    type(person).objects.filter(pk=person.pk).update(phone=None)
    token, _ = acting(admin, person)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    response = client.get('/api/farms')
    assert response.status_code == 200, response.content


# ── every route is classified ────────────────────────────────────────────────────────────────

def test_every_route_that_uses_the_session_login_is_stopped_unless_it_is_listed_open(jwt_client):
    client = jwt_client(UserFactory(phone=None))
    seen_open, checked = set(), 0
    for route, pattern in routes():
        if not uses_the_session_login(pattern):
            continue   # public pages and the sensors' own keys
        response = client.get(concrete(route))
        if pattern.name in OPEN_URL_NAMES:
            seen_open.add(pattern.name)
            assert response.json().get('code') != 'phone_required', route
        else:
            assert response.status_code == 403 and response.json().get('code') == 'phone_required', (route, pattern.name, response.status_code)
        checked += 1
    assert checked > 30
    # A name in the list that no route has is a typo that would open nothing, or hide a renamed route.
    assert seen_open == set(OPEN_URL_NAMES)


def test_the_open_list_is_exactly_what_the_gate_screen_needs():
    assert OPEN_URL_NAMES == frozenset({
        'auth_me', 'auth_logout', 'auth_session_ping', 'auth_mfa_status', 'auth_mfa_recovery_codes', 'auth_mfa_step_up',
        # The team's banners, such as a maintenance notice, show on this screen too.
        'announcements_current',
    })


def test_the_gate_adds_no_database_query(jwt_client):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext
    person = UserFactory(phone=None)
    with CaptureQueriesContext(connection) as without:
        jwt_client(person).get(ME)
    with_number = UserFactory()
    with CaptureQueriesContext(connection) as withn:
        jwt_client(with_number).get(ME)
    assert len(without) <= len(withn)


# ── a closure that is scheduled ──────────────────────────────────────────────────────────────

def scheduled(**fields):
    """A person who asked to close their account a day ago."""
    person = UserFactory(**fields)
    type(person).objects.filter(pk=person.pk).update(deletion_requested_at=timezone.now())
    person.refresh_from_db()
    return person


def closing(response):
    assert response.status_code == 403, response.content
    assert response.json()['code'] == 'deletion_scheduled'


def test_a_scheduled_account_is_refused_with_deletion_scheduled_on_every_route_but_the_open_ones(jwt_client):
    client = jwt_client(scheduled())
    seen_open, checked = set(), 0
    for route, pattern in routes():
        if not uses_the_session_login(pattern):
            continue
        response = client.get(concrete(route))
        if pattern.name in DELETION_OPEN_URL_NAMES:
            seen_open.add(pattern.name)
            assert response.json().get('code') != 'deletion_scheduled', route
        else:
            assert response.status_code == 403 and response.json().get('code') == 'deletion_scheduled', (route, pattern.name, response.status_code)
        checked += 1
    assert checked > 30
    assert seen_open == set(DELETION_OPEN_URL_NAMES)


def test_the_open_list_for_a_scheduled_account_is_exactly_what_its_screen_needs():
    assert DELETION_OPEN_URL_NAMES == frozenset({
        'auth_me', 'auth_logout', 'auth_session_ping', 'auth_delete_account_cancel',
        'announcements_current',   # the team's banners show on the closure screen too
    })


def test_the_deletion_reason_comes_before_the_phone_reason(jwt_client):
    closing(jwt_client(scheduled(phone=None)).get('/api/farms'))


def test_the_cancel_route_answers_a_scheduled_account(jwt_client):
    person = scheduled()
    response = jwt_client(person).post('/api/auth/delete-account/cancel')
    assert response.status_code == 200, response.content
    person.refresh_from_db()
    assert person.deletion_requested_at is None


def test_a_scheduled_account_can_read_itself_and_sign_out(jwt_client):
    client = jwt_client(scheduled())
    assert client.get(ME).status_code == 200
    assert client.post('/api/auth/logout').status_code == 200


def test_the_answer_says_deletion_scheduled_in_the_language_asked_for(jwt_client):
    from core.doc_text import t
    response = jwt_client(scheduled()).get('/api/farms', HTTP_ACCEPT_LANGUAGE='fr')
    closing(response)
    assert response.json()['message'] == t('fr', 'erDeletionScheduled')


def test_support_access_is_not_stopped_by_a_scheduled_closure(jwt_client):
    from rest_framework.test import APIClient
    admin, person = admin_and_person()
    type(person).objects.filter(pk=person.pk).update(deletion_requested_at=timezone.now())
    token, _ = acting(admin, person)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    assert client.get('/api/farms').status_code == 200


def test_the_deletion_refusal_is_not_logged_as_a_refusal_for_the_role(jwt_client):
    from logs.models import SecurityEvent
    closing(jwt_client(scheduled()).get('/api/farms'))
    assert not SecurityEvent.objects.filter(kind='permission_denied').exists()


def test_a_scheduled_account_adds_no_database_query(jwt_client):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext
    person = scheduled()
    with CaptureQueriesContext(connection) as closed:
        jwt_client(person).get(ME)
    other = UserFactory()
    with CaptureQueriesContext(connection) as normal:
        jwt_client(other).get(ME)
    assert len(closed) <= len(normal)
