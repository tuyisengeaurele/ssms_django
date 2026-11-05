"""The load test script: its arithmetic and its verdict. The live run is the owner's, against the real site."""
import asyncio
import json

import httpx
import pytest

from scripts import load_test
from scripts.load_test import Sample, passed, percentile, summarise

QUICK = (0.01, 0.02)  # the pause between one person's requests, short so a test is quick


def good(request):
    return httpx.Response(200, json={'success': True, 'data': []})


def run(handler, tokens=('a', 'b', 'c'), seconds=0.3):
    transport = httpx.MockTransport(handler)
    return asyncio.run(load_test.run('http://test', list(tokens), seconds, transport=transport, pause=QUICK))


def test_percentile_picks_the_value_that_that_share_of_requests_stay_under():
    values = [float(n) for n in range(1, 101)]
    assert percentile(values, 50) == 50
    assert percentile(values, 95) == 95
    assert percentile(values, 100) == 100
    assert percentile([], 95) == 0.0
    assert percentile([3.0], 95) == 3.0


def test_the_summary_counts_requests_failures_and_the_slowest():
    samples = [Sample('/a', 0.1, True), Sample('/a', 0.3, True), Sample('/b', 5.0, False)]
    summary = summarise(samples)
    assert (summary.requests, summary.failures, summary.slowest) == (3, 1, 5.0)


@pytest.mark.parametrize('samples,verdict', [
    ([Sample('/a', 0.1, True)] * 20, True),
    ([Sample('/a', 0.1, True)] * 20 + [Sample('/a', 0.2, False)], False),    # one failed request is a failure
    ([Sample('/a', 0.1, True)] * 90 + [Sample('/a', 3.0, True)] * 10, False),  # the slowest tenth took 3 seconds
    ([], False),                                                               # nothing was measured
])
def test_the_run_passes_only_with_no_failures_and_a_95th_percentile_under_two_seconds(samples, verdict):
    assert passed(summarise(samples)) is verdict


def test_every_person_signs_requests_with_their_own_token_and_every_page_is_asked_for():
    seen_tokens, seen_paths = set(), set()

    def handler(request):
        seen_tokens.add(request.headers['authorization'])
        seen_paths.add(request.url.path)
        return good(request)

    samples = run(handler, tokens=[f't{n}' for n in range(20)])
    assert seen_tokens == {f'Bearer t{n}' for n in range(20)}
    assert seen_paths == set(load_test.PATHS)
    assert all(sample.ok for sample in samples)


def test_a_server_error_is_a_failed_request_and_fails_the_run():
    def handler(request):
        return httpx.Response(500) if request.url.path == '/api/alerts' else good(request)

    samples = run(handler)
    assert summarise(samples).failures > 0
    assert not passed(summarise(samples))


def test_too_many_requests_is_a_failed_request():
    samples = run(lambda request: httpx.Response(429))
    assert summarise(samples).failures == summarise(samples).requests > 0


def test_a_connection_that_breaks_is_counted_and_does_not_stop_the_run():
    def handler(request):
        raise httpx.ConnectError('no route')

    samples = run(handler)
    assert summarise(samples).failures == summarise(samples).requests > 0


def write_tokens(tmp_path, tokens=('x', 'y')):
    target = tmp_path / 'tokens.json'
    target.write_text(json.dumps({'tokens': list(tokens)}), encoding='utf-8')
    return str(target)


def main(argv, handler=good):
    return load_test.main(argv, transport=httpx.MockTransport(handler), pause=QUICK)


def test_main_exits_0_when_the_run_passes(tmp_path, capsys):
    code = main(['http://test', '--tokens-file', write_tokens(tmp_path), '--seconds', '0.3'])
    assert code == 0
    assert 'requests' in capsys.readouterr().out


def test_main_exits_1_when_the_run_fails(tmp_path):
    def handler(request):
        return good(request) if request.url.path == '/api/health' else httpx.Response(500)

    assert main(['http://test', '--tokens-file', write_tokens(tmp_path), '--seconds', '0.3'], handler=handler) == 1


def test_main_says_what_to_do_when_the_tokens_file_is_missing(tmp_path, capsys):
    code = main(['http://test', '--tokens-file', str(tmp_path / 'nothing.json'), '--seconds', '0.3'])
    assert code == 2
    assert 'prepare_load_test' in capsys.readouterr().err
