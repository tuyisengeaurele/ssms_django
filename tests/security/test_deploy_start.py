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
    # The rate limits keep their counters in this table. Without it every throttled request fails.
    assert script.index('manage.py createcachetable') < script.index('uvicorn')
