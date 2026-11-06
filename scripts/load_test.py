"""Rehearse a busy day: many people reading the app at once, and a verdict on whether it kept up.

    python manage.py prepare_load_test --users 50 --tokens-file load_tokens.json      (with DATABASE_URL set)
    python scripts/load_test.py https://your-site.example --tokens-file load_tokens.json --minutes 3
    python manage.py prepare_load_test --remove                                       (clean up afterwards)

Each simulated person has their own account and token, because the API limits each person to 300 requests a minute.
Each person loads a page (who am I, my farms, my alerts together) and then reads for 8 to 20 seconds, so 50 people make
about 11 requests a second. --stress makes each person ask every half second to two seconds instead, about 40 requests a
second for 50 people, to find the ceiling. A real crowd is nearer the default. The script first wakes the API if it is
asleep, which can take a minute, and does not count that.

It passes when no request failed (a 429 counts as a failure) and 95 percent of requests took under two seconds.
It exits with 1 when it does not, and 2 when it cannot start. It only reads: it changes nothing on the server.
The tokens file opens real accounts, so keep it out of git and delete it after the run.
"""
import argparse
import asyncio
import json
import math
import random
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import httpx

PATHS = ['/api/auth/me', '/api/farms', '/api/alerts']
THINK_SECONDS = (8.0, 20.0)    # a person reads a loaded page for this long
PAUSE_SECONDS = THINK_SECONDS
STRESS_SECONDS = (0.5, 2.0)    # --stress: a pause after every request
EVIDENCE_HEADERS = ('server', 'via', 'x-render-routing', 'x-vercel-id', 'retry-after', 'content-type')
LIMIT_SECONDS = 2.0
WAKE_LIMIT_SECONDS = 150


@dataclass(frozen=True)
class Sample:
    path: str
    seconds: float
    ok: bool
    status: int | None = None   # the HTTP answer, or None when the connection broke
    note: str = ''              # for an answer of 400 or more: which headers and what text came back


@dataclass(frozen=True)
class Summary:
    requests: int
    failures: int
    p50: float
    p95: float
    slowest: float
    statuses: dict = field(default_factory=dict)   # how many requests got each answer, None for a broken connection
    examples: dict = field(default_factory=dict)   # the first note of each refusal, to tell our API from a host in front


def percentile(values: list[float], pct: float) -> float:
    """The value that `pct` percent of the requests stayed under (nearest rank)."""
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, math.ceil(pct / 100 * len(ordered)))
    return ordered[min(rank, len(ordered)) - 1]


def summarise(samples: list[Sample]) -> Summary:
    times = [sample.seconds for sample in samples]
    return Summary(
        requests=len(samples),
        failures=sum(1 for sample in samples if not sample.ok),
        p50=percentile(times, 50),
        p95=percentile(times, 95),
        slowest=max(times, default=0.0),
        statuses=dict(Counter(sample.status for sample in samples)),
        examples={status: next(s.note for s in samples if s.status == status and s.note)
                  for status in {s.status for s in samples if s.note}},
    )


def passed(summary: Summary, limit_seconds: float = LIMIT_SECONDS) -> bool:
    return summary.requests > 0 and summary.failures == 0 and summary.p95 < limit_seconds


def _note(answer: httpx.Response) -> str:
    """Which headers and what text came back with a refusal. Our API answers in JSON with a reference, a host does not."""
    headers = ', '.join(f'{name}={answer.headers[name]}' for name in EVIDENCE_HEADERS if name in answer.headers)
    return f'{headers or "no identifying headers"}; body: {answer.text[:120]!r}'


async def _one_person(client: httpx.AsyncClient, token: str, until: float, samples: list[Sample], pause: tuple[float, float], spread: bool = False):
    """One person: load a page (three requests together), then read. With `spread`, pause after every request instead."""
    headers = {'Authorization': f'Bearer {token}'}
    if not spread:
        await asyncio.sleep(random.uniform(0, pause[1]))   # people do not all arrive in the same instant
    while time.monotonic() < until:
        for path in PATHS:
            started = time.monotonic()
            status, note = None, ''
            try:
                answer = await client.get(path, headers=headers)
                status = answer.status_code
                ok = status < 400
                note = '' if ok else _note(answer)
            except httpx.HTTPError:
                ok = False
            samples.append(Sample(path, time.monotonic() - started, ok, status, note))
            if spread:
                await asyncio.sleep(random.uniform(*pause))
        if not spread:
            await asyncio.sleep(random.uniform(*pause))


async def run(base: str, tokens: list[str], seconds: float, transport=None, pause: tuple[float, float] = PAUSE_SECONDS, spread: bool = False) -> list[Sample]:
    """Everyone reads at once for `seconds`. Returns one sample per request."""
    samples: list[Sample] = []
    async with httpx.AsyncClient(base_url=base, timeout=60, transport=transport) as client:
        until = time.monotonic() + seconds
        await asyncio.gather(*(_one_person(client, token, until, samples, pause, spread) for token in tokens))
    return samples


async def _wake(base: str, transport=None) -> bool:
    """Ask the API's health page until it answers. A free host that slept takes about a minute."""
    deadline = time.monotonic() + WAKE_LIMIT_SECONDS
    async with httpx.AsyncClient(base_url=base, timeout=60, transport=transport) as client:
        while time.monotonic() < deadline:
            try:
                if (await client.get('/api/health')).status_code == 200:
                    return True
            except httpx.HTTPError:
                pass
            await asyncio.sleep(3)
    return False


async def _check_token(base: str, token: str, transport=None) -> str | None:
    """Ask once with the first token. A refusal here means the whole run would be refused, so say why and stop.

    Returns the reason to stop, or None to go ahead. Other bad answers (a 500, a slow page) are what the run measures.
    """
    async with httpx.AsyncClient(base_url=base, timeout=60, transport=transport) as client:
        try:
            status = (await client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'})).status_code
        except httpx.HTTPError:
            return None
    if status == 401:
        return ('The site refused the tokens (401). They are signed with the JWT_SECRET in your terminal, and the API only '
                'accepts tokens signed with its own. Set JWT_SECRET in your terminal to the value on Render, run '
                'prepare_load_test again, then retry.')
    if status == 429:
        return 'This address is rate limited right now (429). Wait a minute and try again.'
    return None


def main(argv=None, transport=None, pause: tuple[float, float] = PAUSE_SECONDS) -> int:
    parser = argparse.ArgumentParser(description='Simulate many people reading SSMS at once.')
    parser.add_argument('base', help='The site address, for example https://ssms-django.vercel.app')
    parser.add_argument('--tokens-file', default='load_tokens.json', help='Made by manage.py prepare_load_test.')
    parser.add_argument('--minutes', type=float, default=3.0)
    parser.add_argument('--seconds', type=float, default=None, help='Overrides --minutes. Handy for a quick try.')
    parser.add_argument('--stress', action='store_true', help='Each person asks every half second to two seconds, to find the ceiling.')
    args = parser.parse_args(argv)

    try:
        tokens = json.loads(Path(args.tokens_file).read_text(encoding='utf-8'))['tokens']
    except (OSError, ValueError, KeyError):
        print(f'Cannot read {args.tokens_file}. Make it first with: python manage.py prepare_load_test --users 50', file=sys.stderr)
        return 2

    base = args.base.rstrip('/')
    if not asyncio.run(_wake(base, transport)):
        print(f'{base} did not answer /api/health in {WAKE_LIMIT_SECONDS} seconds. Is it up?', file=sys.stderr)
        return 2

    reason = asyncio.run(_check_token(base, tokens[0], transport)) if tokens else None
    if reason:
        print(reason, file=sys.stderr)
        return 2

    seconds = args.seconds if args.seconds is not None else args.minutes * 60
    print(f'{len(tokens)} people reading {base} for {seconds:.0f} seconds...')
    if args.stress:
        samples = asyncio.run(run(base, tokens, seconds, transport=transport, pause=STRESS_SECONDS if pause == PAUSE_SECONDS else pause, spread=True))
    else:
        samples = asyncio.run(run(base, tokens, seconds, transport=transport, pause=pause))
    summary = summarise(samples)

    print(f'{summary.requests} requests, {summary.failures} failed')
    print(f'median {summary.p50:.2f} s, 95th percentile {summary.p95:.2f} s, slowest {summary.slowest:.2f} s')
    answers = ', '.join(f'{"no answer" if status is None else status} x{count}' for status, count in sorted(summary.statuses.items(), key=lambda item: -item[1]))
    print(f'answers: {answers}')
    for status, example in sorted(summary.examples.items()):
        print(f'{status} looked like: {example}')
    for path in PATHS:
        mine = [sample for sample in samples if sample.path == path]
        if mine:
            line = summarise(mine)
            print(f'  {path}: {line.requests} requests, {line.failures} failed, 95th percentile {line.p95:.2f} s')
    verdict = passed(summary)
    print('PASS' if verdict else f'FAIL: needs no failed requests and a 95th percentile under {LIMIT_SECONDS:.0f} seconds')
    return 0 if verdict else 1


if __name__ == '__main__':
    sys.exit(main())
