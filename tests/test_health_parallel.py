"""The admin health page asks the web, the disease check service and the website. Those are three waits for a reply, so they
run side by side. The checks that use the database stay on the calling thread, so the connection pool (at most 4) is never
shared by several threads."""
import threading
import time

from core import health


def fake(key, delay=0.0, record=None):
    def check():
        if record is not None:
            record[key] = threading.current_thread().name
        time.sleep(delay)
        return {'key': key, 'status': 'ok', 'values': {}}
    return check


def use(monkeypatch, checks):
    monkeypatch.setattr(health, '_all_checks', lambda now: checks)
    monkeypatch.setattr(health, 'what_is_waiting', lambda: {})


def test_the_network_checks_run_side_by_side(monkeypatch):
    use(monkeypatch, {
        'web': fake('web', 0.4), 'database': fake('database'), 'aiService': fake('aiService', 0.4),
        'website': fake('website', 0.4), 'sensors': fake('sensors'),
    })
    started = time.perf_counter()
    result = health.run_checks()
    assert time.perf_counter() - started < 0.9   # three 0.4 second waits one after another would take 1.2
    assert [c['key'] for c in result['checks']] == ['web', 'database', 'aiService', 'website', 'sensors']


def test_checks_that_use_the_database_stay_on_the_calling_thread(monkeypatch):
    seen = {}
    use(monkeypatch, {
        'web': fake('web', record=seen), 'database': fake('database', record=seen), 'sensors': fake('sensors', record=seen),
        'jobs': fake('jobs', record=seen), 'alertStream': fake('alertStream', record=seen),
    })
    health.run_checks()
    here = threading.current_thread().name
    assert seen['database'] == seen['sensors'] == seen['jobs'] == seen['alertStream'] == here
    assert seen['web'] != here


def test_a_network_check_that_breaks_is_a_problem_for_that_service_only(monkeypatch):
    def broken():
        raise RuntimeError('boom')
    use(monkeypatch, {'web': broken, 'database': fake('database')})
    result = health.run_checks()
    assert {c['key']: c['status'] for c in result['checks']} == {'web': 'problem', 'database': 'ok'}
    assert result['overall'] == 'problem'


def test_skipped_services_are_still_skipped(monkeypatch):
    use(monkeypatch, {'web': fake('web'), 'aiService': fake('aiService')})
    assert [c['key'] for c in health.run_checks(skip=('aiService',))['checks']] == ['web']


def test_a_run_with_only_one_network_check_still_works(monkeypatch):
    use(monkeypatch, {'website': fake('website')})
    assert [c['key'] for c in health.run_checks()['checks']] == ['website']


def test_a_network_check_that_is_still_waiting_at_the_deadline_is_reported_as_a_timeout(monkeypatch):
    # A sleeping free host can make httpx wait longer than its own timeout (connecting and reading each get the full time).
    # The page must not wait for it: it says "timeout" for that service and moves on.
    use(monkeypatch, {'web': fake('web'), 'database': fake('database'), 'aiService': fake('aiService', 2.0)})
    monkeypatch.setattr(health, 'NETWORK_DEADLINE', 0.3)
    started = time.perf_counter()
    result = health.run_checks()
    assert time.perf_counter() - started < 1.0
    by_key = {c['key']: c for c in result['checks']}
    assert by_key['aiService'] == {'key': 'aiService', 'status': 'problem', 'values': {'reason': 'timeout'}}
    assert by_key['web']['status'] == 'ok' and by_key['database']['status'] == 'ok'
    assert result['overall'] == 'problem'
    assert [c['key'] for c in result['checks']] == ['web', 'database', 'aiService']
