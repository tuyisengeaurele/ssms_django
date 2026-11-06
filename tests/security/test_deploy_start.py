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


def uvicorn_arguments(tmp_path, workers):
    """Run the real start.sh with stand-ins for python and uvicorn, and return the arguments uvicorn was started with."""
    import os
    import shutil
    import subprocess

    import pytest

    bash = shutil.which('bash')
    if bash is None:
        pytest.skip('needs bash')
    log = tmp_path / 'calls.txt'
    for name in ('python', 'uvicorn'):
        stub = tmp_path / name
        stub.write_text(f'#!/usr/bin/env bash\necho "{name} $@" >> "{log.as_posix()}"\n', encoding='utf-8', newline='\n')
        stub.chmod(0o755)
    env = {**os.environ, 'PATH': f'{tmp_path}{os.pathsep}{os.environ["PATH"]}', 'WEB_CONCURRENCY': str(workers)}
    subprocess.run([bash, str(ROOT / 'start.sh')], cwd=ROOT, env=env, check=True, capture_output=True, timeout=60)
    calls = log.read_text(encoding='utf-8').splitlines()
    return [line for line in calls if line.startswith('uvicorn')][0]


def test_one_worker_is_never_told_to_exit_after_a_number_of_requests(tmp_path):
    # With one worker uvicorn has no supervisor, so a worker that exits takes the whole service down until the host restarts it.
    assert '--limit-max-requests' not in uvicorn_arguments(tmp_path, 1)


def test_several_workers_are_replaced_after_a_number_of_requests_to_keep_memory_flat(tmp_path):
    assert '--limit-max-requests 1000' in uvicorn_arguments(tmp_path, 2)
