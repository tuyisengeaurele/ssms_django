"""Rehearse a busy day: many people reading the app at once, and a verdict on whether it kept up.

    python manage.py prepare_load_test --users 50 --tokens-file load_tokens.json      (with DATABASE_URL set)
    python scripts/load_test.py https://your-site.example --tokens-file load_tokens.json --minutes 3
    python manage.py prepare_load_test --remove                                       (clean up afterwards)

Each simulated person has their own account and token, because the API limits each person to 300 requests a minute.
They read three pages (who am I, my farms, my alerts) with a pause of half a second to two seconds between requests,
the way a person reads. The script first wakes the API if it is asleep, which can take a minute, and does not count that.

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
from dataclasses import dataclass
from pathlib import Path

import httpx

PATHS = ['/api/auth/me', '/api/farms', '/api/alerts']
PAUSE_SECONDS = (0.5, 2.0)
LIMIT_SECONDS = 2.0
WAKE_LIMIT_SECONDS = 150


@dataclass(frozen=True)
class Sample:
    path: str
    seconds: float
    ok: bool


@dataclass(frozen=True)
class Summary:
    requests: int
    failures: int
    p50: float
    p95: float
    slowest: float


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
    )


def passed(summary: Summary, limit_seconds: float = LIMIT_SECONDS) -> bool:
    return summary.requests > 0 and summary.failures == 0 and summary.p95 < limit_seconds


async def _one_person(client: httpx.AsyncClient, token: str, until: float, samples: list[Sample], pause: tuple[float, float]):
    headers = {'Authorization': f'Bearer {token}'}
    while time.monotonic() < until:
        for path in PATHS:
            started = time.monotonic()
            try:
                answer = await client.get(path, headers=headers)
                ok = answer.status_code < 400
            except httpx.HTTPError:
                ok = False
            samples.append(Sample(path, time.monotonic() - started, ok))
            await asyncio.sleep(random.uniform(*pause))


async def run(base: str, tokens: list[str], seconds: float, transport=None, pause: tuple[float, float] = PAUSE_SECONDS) -> list[Sample]:
    """Everyone reads at once for `seconds`. Returns one sample per request."""
    samples: list[Sample] = []
    async with httpx.AsyncClient(base_url=base, timeout=60, transport=transport) as client:
        until = time.monotonic() + seconds
        await asyncio.gather(*(_one_person(client, token, until, samples, pause) for token in tokens))
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


def main(argv=None, transport=None, pause: tuple[float, float] = PAUSE_SECONDS) -> int:
    parser = argparse.ArgumentParser(description='Simulate many people reading SSMS at once.')
    parser.add_argument('base', help='The site address, for example https://ssms-django.vercel.app')
    parser.add_argument('--tokens-file', default='load_tokens.json', help='Made by manage.py prepare_load_test.')
    parser.add_argument('--minutes', type=float, default=3.0)
    parser.add_argument('--seconds', type=float, default=None, help='Overrides --minutes. Handy for a quick try.')
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

    seconds = args.seconds if args.seconds is not None else args.minutes * 60
    print(f'{len(tokens)} people reading {base} for {seconds:.0f} seconds...')
    samples = asyncio.run(run(base, tokens, seconds, transport=transport, pause=pause))
    summary = summarise(samples)

    print(f'{summary.requests} requests, {summary.failures} failed')
    print(f'median {summary.p50:.2f} s, 95th percentile {summary.p95:.2f} s, slowest {summary.slowest:.2f} s')
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
