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


def run(handler, tokens=('a', 'b', 'c'), seconds=0.3, pause=QUICK):
    transport = httpx.MockTransport(handler)
    return asyncio.run(load_test.run('http://test', list(tokens), seconds, transport=transport, pause=pause))


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


def test_the_summary_counts_each_kind_of_answer_so_a_refusal_is_not_mistaken_for_a_slow_site():
    samples = [Sample('/a', 0.1, False, 401)] * 3 + [Sample('/a', 0.1, True, 200), Sample('/a', 0.1, False, None)]
    assert summarise(samples).statuses == {401: 3, 200: 1, None: 1}


def test_a_run_prints_how_many_requests_got_each_answer(tmp_path, capsys):
    def handler(request):
        return good(request) if request.url.path == '/api/health' else httpx.Response(500)

    main(['http://test', '--tokens-file', write_tokens(tmp_path), '--seconds', '0.3'], handler=handler)
    assert 'answers: 500' in capsys.readouterr().out


def preflight_handler(status):
    def handler(request):
        if request.url.path == '/api/health' or status == 200:
            return good(request)
        return httpx.Response(status)
    return handler


def test_main_stops_before_the_run_when_the_site_refuses_the_tokens(tmp_path, capsys):
    code = main(['http://test', '--tokens-file', write_tokens(tmp_path), '--seconds', '0.3'], handler=preflight_handler(401))
    captured = capsys.readouterr()
    assert code == 2
    assert 'JWT_SECRET' in captured.err
    assert 'requests,' not in captured.out  # it never ran


def test_main_stops_before_the_run_when_this_address_is_already_rate_limited(tmp_path, capsys):
    code = main(['http://test', '--tokens-file', write_tokens(tmp_path), '--seconds', '0.3'], handler=preflight_handler(429))
    assert code == 2
    assert 'minute' in capsys.readouterr().err


def test_a_person_loads_a_page_then_reads_for_a_while_instead_of_asking_every_second():
    import time
    seen = []

    def handler(request):
        seen.append((time.monotonic(), request.url.path))
        return good(request)

    run(handler, tokens=['a'], seconds=1.6, pause=(0.3, 0.3))
    gaps = [later[0] - earlier[0] for earlier, later in zip(seen, seen[1:])]
    assert [path for _, path in seen[:3]] == load_test.PATHS      # one page view is the three requests together
    assert gaps[0] < 0.2 and gaps[1] < 0.2                          # with no reading time between them
    assert gaps[2] >= 0.25                                          # then the person reads before the next page


def test_the_stress_pace_pauses_after_every_request_to_find_the_ceiling():
    import time
    seen = []

    def handler(request):
        seen.append(time.monotonic())
        return good(request)

    transport = httpx.MockTransport(handler)
    asyncio.run(load_test.run('http://test', ['a'], 0.7, transport=transport, pause=(0.2, 0.2), spread=True))
    gaps = [later - earlier for earlier, later in zip(seen, seen[1:])]
    assert gaps and min(gaps) >= 0.15


def test_an_example_of_each_refusal_shows_who_answered_so_a_host_is_told_from_our_api():
    def handler(request):
        if request.url.path == '/api/farms':
            return httpx.Response(429, headers={'server': 'Vercel', 'x-vercel-id': 'fra1::abc'}, text='Too many requests from this address')
        return good(request)

    samples = run(handler)
    example = summarise(samples).examples[429]
    assert 'server=Vercel' in example and 'x-vercel-id=fra1::abc' in example and 'Too many requests' in example
    assert 200 not in summarise(samples).examples


def test_main_prints_one_example_of_each_refusal(tmp_path, capsys):
    def handler(request):
        if request.url.path == '/api/health':
            return good(request)
        return httpx.Response(503, headers={'server': 'cloudflare'}, text='Service Unavailable')

    main(['http://test', '--tokens-file', write_tokens(tmp_path), '--seconds', '0.3'], handler=handler)
    out = capsys.readouterr().out
    assert '503 looked like: server=cloudflare' in out
