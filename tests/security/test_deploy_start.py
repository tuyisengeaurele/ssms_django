"""How the API is started: under ASGI, on a database that is ready."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def start_script():
    return (ROOT / 'start.sh').read_text(encoding='utf-8')


def test_the_procfile_runs_the_start_script():
    assert (ROOT / 'Procfile').read_text(encoding='utf-8').strip() == 'web: bash start.sh'


def test_the_api_runs_under_asgi_so_live_alert_streams_do_not_hold_workers():
    # The alert stream is an async view. Under a sync WSGI worker each open stream would hold the worker for up to ten minutes.
    script = start_script()
    assert 'ssms_django.asgi:application' in script
    assert 'wsgi' not in script
    assert '--proxy-headers' in script


def test_a_fresh_database_is_ready_before_the_first_request():
    script = start_script()
    assert script.index('manage.py migrate') < script.index('uvicorn')
    # Sign in lockout and the code challenges keep their state in this table. Without it a wrong password raises an error.
    assert script.index('manage.py createcachetable') < script.index('uvicorn')


def run_script(tmp_path, name, **env):
    """Run a copy of a real script with stand-ins for python, pip and uvicorn. Returns every call they received, in order."""
    import os
    import shutil
    import subprocess

    import pytest

    bash = shutil.which('bash')
    if bash is None:
        pytest.skip('needs bash')
    log = tmp_path / 'calls.txt'
    log.write_text('', encoding='utf-8')
    for tool in ('python', 'pip', 'uvicorn'):
        stub = tmp_path / tool
        stub.write_text(f'#!/usr/bin/env bash\necho "{tool} $@" >> "{log.as_posix()}"\n', encoding='utf-8', newline='\n')
        stub.chmod(0o755)
    script = tmp_path / name
    script.write_text((ROOT / name).read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
    full_env = {k: v for k, v in os.environ.items() if k not in ('DATABASE_URL', 'WEB_CONCURRENCY')}
    full_env.update({'PATH': f'{tmp_path}{os.pathsep}{os.environ["PATH"]}', **env})
    subprocess.run([bash, str(script)], cwd=tmp_path, env=full_env, check=True, capture_output=True, timeout=60)
    return log.read_text(encoding='utf-8').splitlines()


def uvicorn_arguments(tmp_path, workers):
    calls = run_script(tmp_path, 'start.sh', WEB_CONCURRENCY=str(workers))
    return [line for line in calls if line.startswith('uvicorn')][0]


def test_one_worker_is_never_told_to_exit_after_a_number_of_requests(tmp_path):
    # With one worker uvicorn has no supervisor, so a worker that exits takes the whole service down until the host restarts it.
    assert '--limit-max-requests' not in uvicorn_arguments(tmp_path, 1)


def test_several_workers_are_replaced_after_a_number_of_requests_to_keep_memory_flat(tmp_path):
    assert '--limit-max-requests 1000' in uvicorn_arguments(tmp_path, 2)


# A free service that wakes from sleep runs the start command again. Each manage.py command is a new Python process that
# loads Django and opens its own database connection, on a CPU that is a fraction of a laptop's, so doing the setup at
# every wake kept the site waiting for a minute or more. The build does it once, and the start only serves.

def manage_calls(calls):
    return [line.removeprefix('python manage.py ').split(' --')[0] for line in calls if line.startswith('python manage.py')]


def test_the_build_sets_up_the_database_and_files_once(tmp_path):
    calls = run_script(tmp_path, 'build.sh', DATABASE_URL='postgres://stand-in')
    assert manage_calls(calls) == ['check', 'migrate', 'createcachetable', 'collectstatic']
    assert (tmp_path / '.setup_done').exists()


def test_a_build_with_no_database_leaves_the_setup_to_the_start(tmp_path):
    calls = run_script(tmp_path, 'build.sh')
    assert manage_calls(calls) == []
    assert not (tmp_path / '.setup_done').exists()


def test_a_wake_after_a_finished_build_only_starts_the_server(tmp_path):
    (tmp_path / '.setup_done').write_text('', encoding='utf-8')
    calls = run_script(tmp_path, 'start.sh', WEB_CONCURRENCY='1')
    assert manage_calls(calls) == []
    assert [line for line in calls if line.startswith('uvicorn')]


def test_a_host_that_did_not_set_up_during_the_build_still_does_it_before_serving(tmp_path):
    calls = run_script(tmp_path, 'start.sh', WEB_CONCURRENCY='1')
    assert manage_calls(calls) == ['check', 'migrate', 'createcachetable', 'collectstatic']
    assert calls[-1].startswith('uvicorn')
