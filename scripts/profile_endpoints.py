"""Time what people read, against a database that holds a real deployment's worth of data.

    DB_NAME=ssms_load python scripts/seed_load_data.py          (once, see that file)
    DB_NAME=ssms_load python scripts/profile_endpoints.py
    DB_NAME=ssms_load python scripts/profile_endpoints.py --json profile.json --rounds 9

It signs in as a farmer, a supervisor and an admin of the seeded data (with tokens, in the same process: no network, no
passwords) and asks for the pages each of them reads. Each one is asked for once to warm up, then --rounds times. For each
it reports the median and worst time, the number of queries, the time the queries took, and the size of the answer.

The time is the application's own: the database here is on the same machine, so a query costs almost nothing. In production
every query is a round trip to a database in another country, so a second figure adds --round-trip-ms (25 by default) for each
query. That estimate is what decides what is slow: anything over --limit-ms (300) in it is listed as a task.

A single query is cancelled after --statement-timeout-ms (20 seconds), so a page that cannot finish is listed with a 500 and the
run goes on.

It refuses a database whose name does not say it is a scratch one (see seed_load_data.py).
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import statistics
import sys
import time
from dataclasses import asdict, dataclass
from datetime import timedelta
from pathlib import Path

LIMIT_MS = 300
ROUND_TRIP_MS = 25
ROUNDS = 7


@dataclass(frozen=True)
class Measure:
    role: str
    path: str
    status: int
    median_ms: float
    worst_ms: float
    queries: int
    db_ms: float
    size_kb: float


def summarize(role, path, status, seconds, queries, db_seconds, size) -> Measure:
    """One endpoint's timings (in seconds), as the numbers that are written down."""
    return Measure(
        role=role, path=path, status=status,
        median_ms=round(statistics.median(seconds) * 1000, 1), worst_ms=round(max(seconds) * 1000, 1),
        queries=queries, db_ms=round(db_seconds * 1000, 1), size_kb=round(size / 1000, 1),
    )


def estimate_ms(measure: Measure, round_trip_ms: float = ROUND_TRIP_MS) -> float:
    """The median time if every query were a round trip to a database that far away."""
    return round(measure.median_ms + measure.queries * round_trip_ms, 1)


def slow(measures, limit_ms: float = LIMIT_MS, round_trip_ms: float = ROUND_TRIP_MS) -> list[Measure]:
    return [m for m in measures if estimate_ms(m, round_trip_ms) > limit_ms]


def markdown_table(measures, limit_ms: float = LIMIT_MS, round_trip_ms: float = ROUND_TRIP_MS) -> str:
    rows = sorted(measures, key=lambda m: estimate_ms(m, round_trip_ms), reverse=True)
    out = [
        '| Role | Endpoint | Status | Median ms | Worst ms | Queries | Query ms | KB | With a database far away | |',
        '|---|---|---|---|---|---|---|---|---|---|',
    ]
    for m in rows:
        estimate = estimate_ms(m, round_trip_ms)
        out.append(
            f'| {m.role} | `{m.path}` | {m.status} | {m.median_ms} | {m.worst_ms} | {m.queries} | {m.db_ms} | {m.size_kb} | {estimate} | '
            f'{"SLOW" if estimate > limit_ms else ""} |',
        )
    return '\n'.join(out)


def rounds_for(warm_seconds: float, wanted: int) -> int:
    """How many timed requests to make once the warm up took this long. A page that takes seconds is not asked for seven times."""
    if warm_seconds >= 5.0:
        return min(wanted, 2)
    if warm_seconds >= 1.0:
        return min(wanted, 3)
    return wanted


def fill(path: str, context: dict) -> str:
    """A path with {farm} and {batch} in it, filled in from what was found for this person."""
    return path.format(**context) if '{' in path else path


# What each kind of person reads. {farm}, {batch}, {other} and {round} are found for the person asking.
FARMER = [
    '/api/auth/me', '/api/farms', '/api/farms/{farm}', '/api/farms/{farm}/summary', '/api/farms/{farm}/rooms',
    '/api/batches/farm/{farm}', '/api/batches/{batch}', '/api/batches/compare?ids={batch},{other}',
    '/api/alerts', '/api/alerts/batch/{batch}', '/api/devices', '/api/harvest', '/api/harvest/stats',
    '/api/detections/recent', '/api/detections/history', '/api/detections/stats',
    '/api/sensors/batch/{batch}', '/api/sensors/batch/{batch}/series?hours=720',
    '/api/calendar', '/api/supply/allowance', '/api/supply/onboarding', '/api/supply/rounds/current',
]
SUPERVISOR = [
    '/api/auth/me', '/api/farms', '/api/farms/risk', '/api/batches/active', '/api/alerts', '/api/devices',
    '/api/team/farmers', '/api/team/decisions', '/api/team/rooms', '/api/calendar', '/api/harvest', '/api/harvest/stats',
    '/api/detections/history', '/api/detections/stats', '/api/reports/cooperative?from={start}&to={end}',
    '/api/supply/rounds', '/api/supply/rounds/{round}', '/api/supply/suggestions', '/api/supply/allowance/requests',
]
ADMIN = [
    '/api/auth/me', '/api/farms', '/api/farms/risk', '/api/batches/active', '/api/alerts', '/api/devices',
    '/api/cooperatives', '/api/harvest/stats', '/api/detections/stats', '/api/reports/cooperative?from={start}&to={end}',
    '/api/calendar', '/api/supply/rounds',
]


def setup_django() -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ssms_django.settings')
    import django

    django.setup()


def client_for(user):
    """An API client holding a real access token, as a browser does. An admin gets a session that passed its code."""
    from django.utils import timezone
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import AccessToken

    from users.models import UserSession

    token = AccessToken.for_user(user)
    if user.role == 'ADMIN':
        now = timezone.now()
        session = UserSession.objects.create(user=user, last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now), mfa_verified_at=now)
        token['sid'] = session.id
    client = APIClient(raise_request_exception=False)   # a query that was cancelled is a 500 in the table, not the end of the run
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


def measure_all(role, user, paths, context, rounds, log=print) -> list[Measure]:
    from django.core.cache import caches
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    results = []
    for template in paths:
        path = fill(template, context)
        client = client_for(user)    # a token lives 15 minutes, and a run can be longer than that
        caches['throttle'].clear()   # a rate limit is not what is being measured
        caches['reports'].clear()    # the report on screen is kept for a minute: time the report, not the cache
        begun = time.perf_counter()
        client.get(path)             # warm up: one-off lookups
        warm = time.perf_counter() - begun
        seconds, status, size, queries, db_seconds = [], 0, 0, 0, 0.0
        for _ in range(rounds_for(warm, rounds)):
            caches['reports'].clear()
            with CaptureQueriesContext(connection) as captured:
                begun = time.perf_counter()
                response = client.get(path)
                seconds.append(time.perf_counter() - begun)
            status, size = response.status_code, len(response.content)
            queries = len(captured)
            db_seconds = sum(float(q['time']) for q in captured.captured_queries)
        results.append(summarize(role, template, status, seconds, queries, db_seconds, size))
        log(f'  {role:10} {status} {results[-1].median_ms:9.1f} ms {queries:3} queries ({results[-1].db_ms:9.1f} ms in the database)  {template}')
    return results


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Time the pages people read, on seeded data.')
    parser.add_argument('--rounds', type=int, default=ROUNDS, help='Timed requests for each endpoint after the warm up.')
    parser.add_argument('--limit-ms', type=float, default=LIMIT_MS)
    parser.add_argument('--round-trip-ms', type=float, default=ROUND_TRIP_MS, help='What one query would cost to a database far away.')
    parser.add_argument('--statement-timeout-ms', type=int, default=20000, help='Cancel any one query that takes longer; the page then answers 500 and is listed as such.')
    parser.add_argument('--json', default=None, help='Also write the numbers to this file.')
    options = parser.parse_args(argv)
    setup_django()
    logging.disable(logging.WARNING)   # a 403 or a 404 is in the table; a line of log for every request is noise

    from django.conf import settings
    from django.db import connection
    from django.utils import timezone

    from scripts.seed_load_data import NotAScratchDatabase, check_database_name

    try:
        check_database_name(connection.settings_dict['NAME'])
    except NotAScratchDatabase as refusal:
        print(refusal, file=sys.stderr)
        return 2
    settings.ALLOWED_HOSTS = ['*']
    with connection.cursor() as cursor:
        cursor.execute(f'SET statement_timeout = {int(options.statement_timeout_ms)}')
    print(f'Database: {connection.settings_dict["NAME"]}')

    from batches.models import Batch
    from farms.models import Farm
    from supply.models import SupplyRound
    from users.models import User

    domain = 'load.ssms.rw'
    farmer = User.objects.filter(email=f'farmer1@{domain}').first()
    supervisor = User.objects.filter(email=f'supervisor1@{domain}').first()
    admin = User.objects.filter(email=f'admin@{domain}').first()
    if not (farmer and supervisor and admin):
        print('No load data here. Run scripts/seed_load_data.py first.', file=sys.stderr)
        return 2
    today = timezone.now().date()
    base = {'start': today - timedelta(days=30), 'end': today}
    farm = Farm.objects.filter(owner=farmer).first()
    batches = list(Batch.objects.filter(farm=farm).order_by('start_date')[:2])
    everyone = {
        'FARMER': (farmer, FARMER, {**base, 'farm': farm.pk, 'batch': batches[0].pk, 'other': batches[1].pk}),
        'SUPERVISOR': (supervisor, SUPERVISOR, {**base, 'round': SupplyRound.objects.filter(cooperative=supervisor.cooperative).first().pk}),
        'ADMIN': (admin, ADMIN, base),
    }
    results = []
    for role, (user, paths, context) in everyone.items():
        print(f'{role}: {len(paths)} pages, {options.rounds} rounds each')
        results += measure_all(role, user, paths, context, options.rounds)

    print()
    print(markdown_table(results, options.limit_ms, options.round_trip_ms))
    over = slow(results, options.limit_ms, options.round_trip_ms)
    broken = [m for m in results if m.status != 200]
    print(f'\n{len(results)} endpoints. {len(over)} over {options.limit_ms:g} ms with a round trip of {options.round_trip_ms:g} ms per query.')
    if broken:
        print('Not answered with 200: ' + ', '.join(f'{m.role} {m.path} ({m.status})' for m in broken))
    if options.json:
        Path(options.json).write_text(json.dumps([asdict(m) for m in results], indent=2), encoding='utf8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
