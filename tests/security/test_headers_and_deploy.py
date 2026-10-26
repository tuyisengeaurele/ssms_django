import json
import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest

from core.config import parse_list
from tests.factories import UserFactory

ROOT = Path(__file__).resolve().parents[2]


def production_env(**extra):
    """The environment of a deployment: DEBUG off, a real secret key, HTTPS only."""
    env = dict(os.environ)
    env.update({
        'DEBUG': 'False',
        'SECRET_KEY': secrets.token_urlsafe(64),
        'SECURE_SSL_REDIRECT': 'True',
    })
    env.update(extra)
    return env


def run_python(code, env):
    out = subprocess.run([sys.executable, '-c', code], cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr[-800:]
    return out.stdout.strip().splitlines()[-1]


SHOW_SETTINGS = (
    "import os, json, django;"
    "os.environ['DJANGO_SETTINGS_MODULE']='ssms_django.settings';"
    "django.setup();"
    "from django.conf import settings as s;"
    "print(json.dumps({k: getattr(s, k, None) for k in ("
    "'CORS_ALLOWED_ORIGINS','ALLOWED_HOSTS','SESSION_COOKIE_SECURE','CSRF_COOKIE_SECURE',"
    "'SECURE_SSL_REDIRECT','SECURE_REDIRECT_EXEMPT','SECURE_HSTS_SECONDS')}))"
)


# ── headers on every API response ───────────────────────────────────────────────────────────

CSP = "default-src 'none'; frame-ancestors 'none'"
PERMISSIONS = 'camera=(), microphone=(), geolocation=()'


@pytest.mark.django_db
@pytest.mark.parametrize('url, expected', [
    ('/api/health', 200),
    ('/api/farms', 401),
    ('/api/nothing-here', 404),
    ('/api/alerts/stream', 401),
])
def test_every_api_response_carries_the_security_headers(api_client, url, expected):
    response = api_client.get(url)
    assert response.status_code == expected
    assert response['Content-Security-Policy'] == CSP
    assert response['Permissions-Policy'] == PERMISSIONS


@pytest.mark.django_db
def test_signed_in_responses_carry_them_too(auth_client):
    response = auth_client(UserFactory()).get('/api/farms')
    assert response.status_code == 200
    assert response['Content-Security-Policy'] == CSP
    assert response['Permissions-Policy'] == PERMISSIONS


# ── lists from the environment ──────────────────────────────────────────────────────────────

def test_parse_list_strips_spaces_and_drops_empty_items():
    assert parse_list('http://a.com, http://b.com ,, ') == ['http://a.com', 'http://b.com']
    assert parse_list('') == []
    assert parse_list('localhost,127.0.0.1') == ['localhost', '127.0.0.1']


def test_settings_read_cors_origins_and_hosts_without_stray_spaces():
    env = production_env(
        CORS_ALLOWED_ORIGINS='https://app.example.rw ,  https://www.example.rw',
        ALLOWED_HOSTS=' api.example.rw , localhost ',
    )
    got = json.loads(run_python(SHOW_SETTINGS, env))
    assert got['CORS_ALLOWED_ORIGINS'] == ['https://app.example.rw', 'https://www.example.rw']
    assert got['ALLOWED_HOSTS'] == ['api.example.rw', 'localhost']


# ── production settings ─────────────────────────────────────────────────────────────────────

def test_production_uses_secure_cookies_https_redirect_and_hsts():
    got = json.loads(run_python(SHOW_SETTINGS, production_env()))
    assert got['SESSION_COOKIE_SECURE'] is True
    assert got['CSRF_COOKIE_SECURE'] is True
    assert got['SECURE_SSL_REDIRECT'] is True
    assert got['SECURE_HSTS_SECONDS'] >= 31536000


def test_the_health_check_is_not_redirected_so_a_plain_probe_still_works():
    got = json.loads(run_python(SHOW_SETTINGS, production_env()))
    assert got['SECURE_REDIRECT_EXEMPT'] == [r'^api/health$']


def test_local_development_is_not_forced_onto_https():
    got = json.loads(run_python(SHOW_SETTINGS, production_env(DEBUG='True', SECURE_SSL_REDIRECT='False')))
    assert got['SESSION_COOKIE_SECURE'] in (False, None)
    assert got['SECURE_SSL_REDIRECT'] in (False, None)


def test_check_deploy_has_no_warnings():
    out = subprocess.run(
        [sys.executable, 'manage.py', 'check', '--deploy', '--fail-level', 'WARNING'],
        cwd=ROOT, env=production_env(), capture_output=True, text=True, timeout=120,
    )
    assert out.returncode == 0, out.stdout + out.stderr
