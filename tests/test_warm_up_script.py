"""The logic behind scripts/warm_up.py. The script itself talks to live addresses and is run by hand before a demonstration."""
import pytest

from scripts.warm_up import health_url, warm_up


class Clock:
    """A clock that only moves when the script sleeps, so a test never waits."""

    def __init__(self):
        self.now = 0.0

    def sleep(self, seconds):
        self.now += seconds

    def time(self):
        return self.now


def answers(*codes):
    """A fake `get` that answers these status codes in turn, then the last one for ever. A code of None is a network error."""
    queue = list(codes)

    def get(url, timeout):
        code = queue.pop(0) if len(queue) > 1 else queue[0]
        if code is None:
            raise OSError('no route')
        return code
    return get


def run(urls, get, **over):
    clock = Clock()
    result = warm_up(urls, get=get, sleep=clock.sleep, now=clock.time, **over)
    return result, clock


def test_an_address_that_answers_at_once_is_ready_after_one_try():
    result, _ = run(['https://api.example.rw'], answers(200))
    assert result == [{'url': 'https://api.example.rw/api/health', 'ok': True, 'tries': 1, 'seconds': 0}]


def test_a_sleeping_address_is_asked_again_until_it_answers():
    result, clock = run(['https://api.example.rw'], answers(502, 503, None, 200))
    assert result[0]['ok'] is True
    assert result[0]['tries'] == 4
    assert result[0]['seconds'] == clock.now == 15   # three waits of 5 seconds


def test_it_gives_up_after_the_limit_and_says_so():
    result, clock = run(['https://api.example.rw'], answers(503), limit_seconds=30)
    assert result[0]['ok'] is False
    assert clock.now <= 30 + 5
    assert result[0]['tries'] >= 6


def test_each_address_is_woken_in_turn_and_reported_on_its_own():
    api_get = {'https://api.example.rw/api/health': answers(200), 'https://ai.example.rw/health': answers(503, 200)}

    def get(url, timeout):
        return api_get[url](url, timeout)

    result, _ = run(['https://api.example.rw', 'https://ai.example.rw'], get)
    assert [(r['url'], r['ok'], r['tries']) for r in result] == [
        ('https://api.example.rw/api/health', True, 1),
        ('https://ai.example.rw/health', True, 2),
    ]


def test_a_failed_address_does_not_stop_the_next_one():
    def get(url, timeout):
        return 503 if 'api' in url else 200

    result, _ = run(['https://api.example.rw', 'https://ai.example.rw'], get, limit_seconds=10)
    assert [r['ok'] for r in result] == [False, True]


@pytest.mark.parametrize('given, ai, expected', [
    ('https://api.example.rw', False, 'https://api.example.rw/api/health'),
    ('https://api.example.rw/', False, 'https://api.example.rw/api/health'),
    ('https://api.example.rw/api/health', False, 'https://api.example.rw/api/health'),
    ('http://localhost:8000', False, 'http://localhost:8000/api/health'),
    ('https://ai.example.rw', True, 'https://ai.example.rw/health'),
    ('https://ai.example.rw/health', True, 'https://ai.example.rw/health'),
])
def test_the_health_route_depends_on_which_service_it_is(given, ai, expected):
    assert health_url(given, ai=ai) == expected


def test_an_address_that_is_not_http_is_refused():
    with pytest.raises(ValueError):
        health_url('file:///etc/passwd')
    with pytest.raises(ValueError):
        health_url('not an address')


def test_nothing_secret_is_in_the_result():
    result, _ = run(['https://api.example.rw'], answers(200))
    assert set(result[0]) == {'url', 'ok', 'tries', 'seconds'}
