"""The OpenAPI description of the API: complete, quiet when generated, honest about who may call what."""
import json
import re

import pytest
from django.core.management import call_command
from django.urls import URLPattern, URLResolver, get_resolver

from core.permissions_table import ROLES, may

METHODS = ('get', 'post', 'put', 'patch', 'delete')
WRITES = ('post', 'put', 'patch')


@pytest.fixture(scope='module')
def schema(tmp_path_factory):
    """Generated the way the command does it, failing on any warning, so a view the generator cannot read breaks this."""
    out = tmp_path_factory.mktemp('schema') / 'openapi.json'
    call_command('spectacular', '--fail-on-warn', '--format', 'openapi-json', '--file', str(out))
    return json.loads(out.read_text(encoding='utf-8'))


def operations(schema):
    for path, item in schema['paths'].items():
        for method, op in item.items():
            if method in METHODS:
                yield path, method, op


def op(schema, path, method='get'):
    return schema['paths'][path][method]


def walk(patterns, prefix=''):
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from walk(entry.url_patterns, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            yield prefix + str(entry.pattern)


def test_every_api_route_is_described(schema):
    routes = set()
    for route in walk(get_resolver().url_patterns):
        if route.startswith('api/'):
            # The generator calls the record in the path {id} whatever the view calls it.
            routes.add('/' + re.sub(r'<(?:\w+:)?(\w+)>', r'{\1}', re.sub(r'<(?:\w+:)?pk>', '<id>', route)))
    # The docs' own routes describe themselves elsewhere and are left out of the schema.
    routes = {r for r in routes if not r.startswith(('/api/schema', '/api/docs'))}
    missing = sorted(routes - set(schema['paths']))
    assert missing == []


def test_every_operation_has_a_tag_a_plain_summary_and_a_success_answer(schema):
    for path, method, o in operations(schema):
        where = f'{method.upper()} {path}'
        assert o.get('tags'), where
        assert o.get('summary', '').strip(), where
        assert not re.match(r'^(GET|POST|PUT|PATCH|DELETE)\s+/', o['summary']), f'{where} summary still starts with the route: {o["summary"]}'
        assert any(code.startswith('2') for code in o['responses']), where
        assert '{' not in o['summary'], f'{where} summary shows a body shape: {o["summary"]}'


def test_the_summary_is_the_first_line_of_what_the_view_says_it_does(schema):
    assert op(schema, '/api/supply/lots/{lot_code}')['summary'].startswith('Every batch that got the same lot of eggs')


def test_operation_ids_are_unique_and_plain_camel_case_so_deep_links_survive(schema):
    ids = [o['operationId'] for _, _, o in operations(schema)]
    assert len(ids) == len(set(ids))
    for oid in ids:
        assert re.fullmatch(r'[a-z][A-Za-z0-9]*', oid), oid
    assert op(schema, '/api/supply/lots/{lot_code}')['operationId'] == 'getSupplyLotsByLotCode'
    assert op(schema, '/api/health')['operationId'] == 'getHealth'


def test_a_view_that_does_several_things_gets_the_sentence_for_each_method(schema):
    # "GET lists the entries, latest day first. POST adds one (the owner or an admin)."
    assert op(schema, '/api/batches/{id}/mortality', 'get')['summary'].startswith('Lists the entries')
    assert op(schema, '/api/batches/{id}/mortality', 'post')['summary'].startswith('Adds one')


def test_a_stub_such_as_admin_only_is_not_used_as_a_summary(schema):
    for path, method, o in operations(schema):
        assert not re.fullmatch(r'(?i)(admins?|staff|authenticated users?|farmers?|supervisors?)( and \w+)? only\.?', o['summary']), f'{method} {path}: {o["summary"]}'


def test_public_routes_show_no_lock_and_signed_in_routes_show_the_bearer_scheme(schema):
    assert not op(schema, '/api/auth/login', 'post').get('security')
    assert not op(schema, '/api/health').get('security')
    assert op(schema, '/api/farms')['security'] == [{'bearerAuth': []}]
    assert schema['components']['securitySchemes']['bearerAuth']['scheme'] == 'bearer'


def test_each_operation_says_who_may_call_it_from_the_permission_table(schema):
    lots = op(schema, '/api/supply/lots/{lot_code}')
    assert lots['x-roles'] == ['SUPERVISOR', 'ADMIN']
    assert 'Who may call this: Supervisor, Admin.' in lots['description']
    assert op(schema, '/api/supply/onboarding')['x-roles'] == ['FARMER']
    assert 'Who may call this: Farmer.' in op(schema, '/api/supply/onboarding')['description']


def test_the_roles_in_the_docs_are_exactly_what_the_guard_allows(schema):
    # A route and method the table knows: the docs and RolePermission read the same table, so they cannot drift.
    farms_create = op(schema, '/api/farms', 'post')['x-roles']
    assert farms_create == [r for r in ROLES if may(r, 'farms', 'create')]
    assert 'SUPERVISOR' not in farms_create


def test_a_public_route_has_no_roles(schema):
    assert 'x-roles' not in op(schema, '/api/auth/login', 'post')
    assert 'x-roles' not in op(schema, '/api/health')


def test_the_error_answers_are_only_the_ones_that_can_happen(schema):
    for path, method, o in operations(schema):
        where = f'{method.upper()} {path}'
        codes = set(o['responses'])
        # The alert stream is opened with a one time ticket, not the bearer token, and refuses a bad ticket with 401.
        locked = bool(o.get('security')) or path == '/api/alerts/stream'
        restricted = bool(o.get('x-roles')) and set(o['x-roles']) != set(ROLES)
        assert ('401' in codes) == locked, where
        # The stream answers a role it refuses with 401 as well, so it never lists a 403.
        assert ('403' in codes) == (locked and restricted and path != '/api/alerts/stream'), where
        assert ('404' in codes) == ('{' in path), where
        assert ('422' in codes) == (method in WRITES), where
        assert '429' in codes, where


def test_the_answers_use_the_envelope_the_api_really_sends(schema):
    ok = op(schema, '/api/farms')['responses']['2XX']['content']['application/json']['schema']
    assert ok == {'$ref': '#/components/schemas/SuccessEnvelope'}
    envelope = schema['components']['schemas']['SuccessEnvelope']['properties']
    assert set(envelope) == {'success', 'message', 'data'}
    error = schema['components']['schemas']['ErrorEnvelope']['properties']
    assert {'success', 'message', 'reference', 'errors', 'code'} <= set(error)


def test_the_schema_holds_no_example_values_and_so_no_credentials(schema):
    text = json.dumps(schema)
    assert '"example"' not in text and '"examples"' not in text
    assert not re.search(r'eyJ[A-Za-z0-9_-]{10,}', text)
