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


def api_host():
    return env_of(render_services()['ssms-api'])['ALLOWED_HOSTS']['value']


def test_the_website_host_sends_api_calls_to_the_api_service_before_the_page_fallback():
    import json
    rewrites = json.loads((ROOT / 'frontend' / 'vercel.json').read_text(encoding='utf-8'))['rewrites']
    assert rewrites[0] == {'source': '/api/:path*', 'destination': f'https://{api_host()}/api/:path*'}
    assert rewrites[-1]['destination'] == '/index.html'


def test_the_api_is_named_by_one_address_everywhere():
    api = env_of(render_services()['ssms-api'])
    assert api['HEALTH_API_URL']['value'] == f'https://{api_host()}'


def test_the_website_is_named_by_one_address_and_it_is_ours():
    # The bare ssms.vercel.app is another account's site. Ours is the Vercel project's own address.
    api = env_of(render_services()['ssms-api'])
    site = api['FRONTEND_URL']['value']
    assert api['CORS_ALLOWED_ORIGINS']['value'] == site
    assert site != 'https://ssms.vercel.app'
    assert site == 'https://ssms-django.vercel.app'


def test_the_api_address_is_ours_and_not_the_bare_name_somebody_else_holds():
    # Render gave ssms-api to another account, so ours carries a suffix. Pointing at the bare name would send
    # every API call, sign in included, to a stranger.
    assert api_host() != 'ssms-api.onrender.com'
    assert api_host().startswith('ssms-api-') and api_host().endswith('.onrender.com')


# ── the database connection under ASGI ──────────────────────────────────────────────────────

SHOW_CONN_MAX_AGE = (
    "import os, django;"
    "os.environ['DJANGO_SETTINGS_MODULE']='ssms_django.settings';"
    "django.setup();"
    "from django.conf import settings as s;"
    "print(s.DATABASES['default']['CONN_MAX_AGE'])"
)


def test_each_request_closes_its_database_connection():
    # Under ASGI every request runs in its own thread, so a connection kept open "for reuse" is never reused and
    # never closed. Supabase's session pooler allows 15 of them, and a deploy failed when they were all taken.
    from tests.security.test_headers_and_deploy import run_python
    for url in ('postgresql://user:pass@localhost:5432/ssms', ''):
        assert run_python(SHOW_CONN_MAX_AGE, production_env(DATABASE_URL=url)) == '0'


SHOW_DB = (
    "import os, json, django;"
    "os.environ['DJANGO_SETTINGS_MODULE']='ssms_django.settings';"
    "django.setup();"
    "from django.conf import settings as s;"
    "d = s.DATABASES['default'];"
    "print(json.dumps({'age': d['CONN_MAX_AGE'], 'options': d.get('OPTIONS', {})}))"
)
FAKE_URL = 'postgresql://user:pass@localhost:5432/ssms'


def show_db(**env):
    import json

    from tests.security.test_headers_and_deploy import run_python
    return json.loads(run_python(SHOW_DB, production_env(**env)))


def test_the_deployed_database_shares_a_small_pool_that_fits_under_the_pooler_limit():
    found = show_db(DATABASE_URL=FAKE_URL)
    assert found['age'] == 0
    assert found['options']['pool'] == {'min_size': 1, 'max_size': 4, 'timeout': 10}


def test_the_pool_size_can_be_set_from_the_environment():
    assert show_db(DATABASE_URL=FAKE_URL, DB_POOL_MAX='6')['options']['pool']['max_size'] == 6


def test_the_local_database_is_not_pooled_so_tests_carry_no_pool_threads():
    assert 'pool' not in show_db(DATABASE_URL='')['options']


def test_the_pooling_package_is_pinned_to_the_same_version_as_the_driver():
    text = (ROOT / 'requirements.txt').read_text(encoding='utf-8')
    assert 'psycopg[binary]==3.2.4' in text and 'psycopg-pool==3.2.4' in text


def test_the_frequent_jobs_ping_the_api_only_in_the_working_window():
    # 06:00 to 20:00 in Rwanda (UTC+2). Outside it the free API sleeps, which keeps Render's 750 free hours for the month.
    _, commands = workflow('jobs-frequent.yml')
    assert '--awake-hours-utc 4-18' in commands
    assert 'check_log_bursts' in commands and 'mark_offline_devices' in commands


# ── a deploy restarts the service, so only changes that reach it should start one ───────────

def redeploys(service, changed):
    """Mimics Render's rule: a changed file starts a deploy if it matches `paths` (when given) and not `ignoredPaths`."""
    from fnmatch import fnmatch
    rules = service.get('buildFilter', {})
    paths, ignored = rules.get('paths'), rules.get('ignoredPaths', [])
    if paths and not any(fnmatch(changed, p) for p in paths):
        return False
    return not any(fnmatch(changed, p) for p in ignored)


def test_the_api_is_not_redeployed_for_a_website_docs_test_or_workflow_change():
    # Each restart briefly runs two copies of the API against a small database pool, so a change that cannot affect it
    # should not cause one.
    api = render_services()['ssms-api']
    for path in ('frontend/src/index.css', 'docs/deploy-runbook.md', 'tests/test_x.py', '.github/workflows/jobs-frequent.yml',
                 'scripts/load_test.py', 'CHANGELOG.md', 'ai_service/main.py'):
        assert not redeploys(api, path), path


def test_the_api_is_redeployed_for_code_dependencies_and_the_manifest():
    api = render_services()['ssms-api']
    for path in ('users/models.py', 'ssms_django/settings.py', 'requirements.txt', 'start.sh', 'render.yaml'):
        assert redeploys(api, path), path


def test_the_disease_service_is_redeployed_only_for_its_own_folder():
    ai = render_services()['ssms-ai']
    assert redeploys(ai, 'ai_service/main.py')
    assert not redeploys(ai, 'users/models.py')
