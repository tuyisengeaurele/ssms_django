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

def test_the_api_service_trusts_the_two_proxies_in_front_of_it():
    # The website host forwards /api to Render, so the caller passes through two hops before the API sees it.
    api = env_of(render_services()['ssms-api'])
    assert api['TRUSTED_PROXY_COUNT']['value'] == '2'


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


# ── Render runs the two web services; the database and the scheduled jobs live elsewhere ──

def test_render_runs_only_the_api_and_the_disease_check_service():
    services = render_services()
    assert set(services) == {'ssms-api', 'ssms-ai'}
    assert all(service['type'] == 'web' for service in services.values())


def test_the_database_is_not_on_render_and_its_address_is_set_by_hand():
    manifest = (ROOT / 'render.yaml').read_text(encoding='utf-8')
    assert 'fromDatabase' not in manifest and 'pserv' not in manifest
    url = env_of(render_services()['ssms-api'])['DATABASE_URL']
    assert url.get('sync') is False and 'value' not in url


def test_the_disease_check_service_has_the_same_shared_secret_to_set_by_hand():
    secret = env_of(render_services()['ssms-ai'])['AI_SERVICE_SECRET']
    assert secret.get('sync') is False and 'value' not in secret


def test_the_disease_check_service_checks_the_model_it_downloads():
    ai = render_services()['ssms-ai']
    assert env_of(ai)['MODEL_SHA256'].get('sync') is False
    assert 'MODEL_URL' in ai['buildCommand'] or 'MODEL_URL' in env_of(ai)


def test_the_start_script_takes_its_worker_count_from_the_host():
    # The free plan has 512 MB, which two workers can fill. The manifest sets one.
    assert 'WEB_CONCURRENCY' in (ROOT / 'start.sh').read_text(encoding='utf-8')
    assert env_of(render_services()['ssms-api'])['WEB_CONCURRENCY']['value'] == '1'


def test_both_services_run_in_europe_next_to_the_database():
    # Django makes many small queries per request, so an ocean between the API and Supabase would slow every page.
    for service in render_services().values():
        assert service['region'] == 'frankfurt'


def test_the_signing_keys_are_set_by_hand_so_the_github_jobs_share_them():
    # A key Render generated would differ from the one in the GitHub secrets, and the jobs would disagree with the API.
    api = env_of(render_services()['ssms-api'])
    for key in ('SECRET_KEY', 'JWT_SECRET'):
        assert api[key].get('sync') is False
        assert 'generateValue' not in api[key] and 'value' not in api[key]


def test_both_services_pin_the_python_version_they_were_tested_with():
    for service in render_services().values():
        assert env_of(service)['PYTHON_VERSION']['value'].count('.') == 2


# ── the scheduled jobs run from GitHub ──────────────────────────────────────────────────────

def workflow(name):
    flow = yaml.safe_load((ROOT / '.github' / 'workflows' / name).read_text(encoding='utf-8'))
    flow['triggers'] = flow.pop(True, None) or flow.get('on')
    steps = [step.get('run', '') for job in flow['jobs'].values() for step in job['steps']]
    return flow, '\n'.join(steps)


def test_the_frequent_jobs_run_every_five_minutes_and_leave_the_disease_service_asleep():
    flow, commands = workflow('jobs-frequent.yml')
    assert flow['triggers']['schedule'] == [{'cron': '*/5 * * * *'}]
    assert 'workflow_dispatch' in flow['triggers']
    for name in ('run_health_checks', 'check_log_bursts', 'mark_offline_devices'):
        assert name in commands
    assert '--skip aiService' in commands


def test_the_nightly_jobs_clean_readings_sessions_and_logs():
    flow, commands = workflow('jobs-nightly.yml')
    assert len(flow['triggers']['schedule']) == 1 and 'workflow_dispatch' in flow['triggers']
    for name in ('cleanup_sensor_readings --days 90', 'prune_sessions --days 30', 'prune_logs'):
        assert name in commands


def test_simulated_readings_are_only_written_when_somebody_presses_the_button():
    flow, _ = workflow('simulate_sensors.yml')
    assert 'schedule' not in flow['triggers'] and 'workflow_dispatch' in flow['triggers']


def test_the_job_workflows_take_every_secret_from_github_and_write_none():
    for name in ('jobs-frequent.yml', 'jobs-nightly.yml'):
        text = (ROOT / '.github' / 'workflows' / name).read_text(encoding='utf-8')
        assert 'secrets.DATABASE_URL' in text and 'DEBUG: "false"' in text
        assert 'postgres://' not in text and 'postgresql://' not in text
        assert 'concurrency:' in text


def test_the_website_host_sends_api_calls_to_the_api_service_before_the_page_fallback():
    import json
    rewrites = json.loads((ROOT / 'frontend' / 'vercel.json').read_text(encoding='utf-8'))['rewrites']
    assert rewrites[0] == {'source': '/api/:path*', 'destination': 'https://ssms-api.onrender.com/api/:path*'}
    assert rewrites[-1]['destination'] == '/index.html'
