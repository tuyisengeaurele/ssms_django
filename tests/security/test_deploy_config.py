"""What a first deployment gets wrong: the proxy count, the way the API is started, and fake data on a live site."""
import subprocess
import sys
from pathlib import Path

import yaml
from django.core.checks import Warning as CheckWarning
from django.test import override_settings

from ssms_django.checks import check_trusted_proxy
from tests.security.test_headers_and_deploy import production_env

ROOT = Path(__file__).resolve().parents[2]


def render_services():
    manifest = yaml.safe_load((ROOT / 'render.yaml').read_text(encoding='utf-8'))
    return {service['name']: service for service in manifest['services']}


def env_of(service):
    return {item['key']: item for item in service.get('envVars', [])}


# ── the proxy count ─────────────────────────────────────────────────────────────────────────

@override_settings(DEBUG=False, TRUSTED_PROXY_COUNT=0)
def test_a_live_site_with_no_trusted_proxy_is_warned_about():
    found = check_trusted_proxy(app_configs=None)
    assert [item.id for item in found] == ['ssms.W001']
    assert isinstance(found[0], CheckWarning)


@override_settings(DEBUG=False, TRUSTED_PROXY_COUNT=1)
def test_a_live_site_behind_one_proxy_is_not_warned():
    assert check_trusted_proxy(app_configs=None) == []


@override_settings(DEBUG=True, TRUSTED_PROXY_COUNT=0)
def test_a_laptop_with_no_proxy_is_not_warned():
    assert check_trusted_proxy(app_configs=None) == []


def test_the_warning_reaches_the_deploy_check():
    out = subprocess.run(
        [sys.executable, 'manage.py', 'check', '--deploy'],
        cwd=ROOT, env=production_env(TRUSTED_PROXY_COUNT='0'), capture_output=True, text=True, timeout=120,
    )
    assert 'ssms.W001' in out.stdout + out.stderr


# ── the Render manifest ─────────────────────────────────────────────────────────────────────

def test_the_api_service_trusts_the_one_proxy_in_front_of_it():
    api = env_of(render_services()['ssms-api'])
    assert api['TRUSTED_PROXY_COUNT']['value'] == '1'


def test_the_api_service_has_the_shared_secret_for_the_disease_check_service():
    secret = env_of(render_services()['ssms-api'])['AI_SERVICE_SECRET']
    assert secret.get('sync') is False and 'value' not in secret


def test_the_manifest_has_no_setting_the_code_ignores():
    assert 'JWT_EXPIRES_DAYS' not in env_of(render_services()['ssms-api'])


def test_no_scheduled_job_writes_simulated_readings_into_the_live_database():
    for service in render_services().values():
        assert 'simulate_sensors' not in service.get('startCommand', '')


def test_the_api_service_starts_with_the_start_script():
    assert render_services()['ssms-api']['startCommand'].strip() == 'bash start.sh'
