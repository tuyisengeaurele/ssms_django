"""The schema and the Swagger page: reachable by anyone, loaded from our own server only, switched off with one setting."""
import re

import pytest
from django.test import override_settings

from core.middleware import CONTENT_SECURITY_POLICY

SCHEMA = '/api/schema/'
DOCS = '/api/docs/'
CSS = '/api/docs/assets/swagger-ui.css'
JS = '/api/docs/assets/swagger-ui-bundle.js'


def test_the_schema_is_open_api_json_for_anyone(api_client):
    response = api_client.get(SCHEMA)
    assert response.status_code == 200
    assert response['Content-Type'].startswith('application/json')
    data = response.json()
    assert data['openapi'].startswith('3.')
    assert data['info']['title'] == 'Smart Sericulture Management System API'
    assert '/api/farms' in data['paths']
    assert '/api/health' in data['paths']
    assert data['components']['securitySchemes']['bearerAuth']['scheme'] == 'bearer'


def test_the_schema_and_the_page_answer_with_and_without_the_trailing_slash(api_client):
    for path in ('/api/schema', '/api/docs'):
        assert api_client.get(path).status_code == 200, path


def test_the_page_loads_swagger_from_our_own_server_with_a_nonce_and_no_inline_script_allowed(api_client):
    response = api_client.get(DOCS)
    assert response.status_code == 200
    assert response['Content-Type'].startswith('text/html')
    csp = response['Content-Security-Policy']
    nonce = re.search(r"script-src 'self' 'nonce-([\w-]+)'", csp)
    assert nonce, csp
    body = response.content.decode()
    assert f'nonce="{nonce.group(1)}"' in body
    script_src = re.search(r'script-src ([^;]+)', csp).group(1)
    assert "'unsafe-inline'" not in script_src and "'unsafe-eval'" not in script_src
    assert "connect-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    # Nothing is fetched from another host: not in the policy and not in the page.
    assert not re.search(r'https?://', csp)
    assert not re.search(r'(?:src|href)="https?://', body)
    assert '/api/docs/assets/swagger-ui-bundle.js' in body and '/api/schema/' in body


def test_the_nonce_is_new_for_every_response(api_client):
    first = api_client.get(DOCS)['Content-Security-Policy']
    second = api_client.get(DOCS)['Content-Security-Policy']
    assert first != second


def test_every_other_api_route_keeps_the_strict_policy(api_client):
    assert api_client.get('/api/health')['Content-Security-Policy'] == CONTENT_SECURITY_POLICY
    assert api_client.get(SCHEMA)['Content-Security-Policy'] == CONTENT_SECURITY_POLICY


def test_the_two_files_are_served_with_the_right_type(api_client):
    css = api_client.get(CSS)
    assert css.status_code == 200 and css['Content-Type'].startswith('text/css')
    js = api_client.get(JS)
    assert js.status_code == 200 and 'javascript' in js['Content-Type']
    assert b'SwaggerUIBundle' in b''.join(js.streaming_content)


@pytest.mark.parametrize('name', ['swagger-ui.css.map', 'LICENSE', '..', '%2e%2e', 'settings.py', '..%2f..%2fmanage.py', 'swagger-ui-bundle.js/../../x'])
def test_only_the_two_listed_files_can_be_fetched(api_client, name):
    assert api_client.get(f'/api/docs/assets/{name}').status_code == 404


def test_all_three_are_not_found_when_the_docs_are_switched_off(api_client):
    with override_settings(API_DOCS_ENABLED=False):
        for path in (SCHEMA, DOCS, CSS, JS):
            assert api_client.get(path).status_code == 404, path


def test_head_works_like_get_for_a_monitor(api_client):
    for path in (SCHEMA, DOCS, CSS):
        assert api_client.head(path).status_code == 200, path


def test_only_get_and_head_are_allowed(api_client):
    for path in (SCHEMA, DOCS, CSS):
        assert api_client.post(path, {}, format='json').status_code == 405, path


# The schema is public on purpose, so it must describe the API and nothing about where it runs or how it is secured. A host name,
# an email address or a key written into a description or an example would be published to everyone.
FORBIDDEN_IN_THE_PUBLIC_SCHEMA = (
    'onrender.com', 'vercel.app', 'supabase', 'cloudinary.com', 'sentry.io', 'localhost', '127.0.0.1',
    '@gmail.com', '@example', 'Bearer ey', 'sk_live', 'AKIA',
)


def test_the_public_schema_names_no_host_address_or_key(api_client):
    text = api_client.get(SCHEMA).content.decode()
    for needle in FORBIDDEN_IN_THE_PUBLIC_SCHEMA:
        assert needle not in text, f'the public schema contains {needle!r}'


def test_the_public_schema_lists_no_server_address(api_client):
    # `servers` would tell a stranger where the API runs. Relative paths are all the page needs.
    assert 'servers' not in api_client.get(SCHEMA).json()


def test_the_public_schema_holds_no_example_of_a_real_secret_field(api_client):
    paths = api_client.get(SCHEMA).json()['paths']
    for path, operations in paths.items():
        for method, operation in operations.items():
            if not isinstance(operation, dict):
                continue
            for header in operation.get('parameters', []):
                assert header.get('name', '').lower() not in ('x-device-key',) or 'example' not in header, (method, path)
