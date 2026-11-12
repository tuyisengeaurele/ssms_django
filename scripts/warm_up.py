"""Wake the sleeping services before a demonstration.

    python scripts/warm_up.py https://ssms-api-cmqa.onrender.com https://ssms-ai.onrender.com

The first address is the API, the others are the disease check service. Each one is asked for its health route until it answers
200 (Render's free plan sleeps after 15 minutes and takes about a minute to wake), and the script says how long that took.
Run it about ten minutes before the demonstration, then sign in once as each role and run one disease check so the model is
loaded. It sends no password, no token and no cookie, and it changes nothing. It exits with 1 when an address never answers.
"""
import argparse
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

RETRY_SECONDS = 5
LIMIT_SECONDS = 180      # a cold start was measured at 68 seconds, so three minutes is a clear failure
REQUEST_TIMEOUT = 20


def health_url(address: str, *, ai: bool = False) -> str:
    """The health route of a service: /api/health for the API, /health for the disease check service."""
    parts = urlsplit(address.strip())
    if parts.scheme not in ('http', 'https') or not parts.netloc:
        raise ValueError(f'"{address}" is not an http or https address.')
    route = '/health' if ai else '/api/health'
    path = parts.path.rstrip('/')
    if path.endswith('/health'):
        route = path
    return f'{parts.scheme}://{parts.netloc}{route}'


def fetch_status(url: str, timeout: float) -> int:
    """The status code of a GET. An error status such as 503 is a code, not an exception."""
    request = urllib.request.Request(url, method='GET', headers={'User-Agent': 'ssms-warm-up'})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec B310 - scheme is checked in health_url
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def warm_up(addresses, *, get=fetch_status, sleep=time.sleep, now=time.monotonic, limit_seconds=LIMIT_SECONDS):
    """Ask each address in turn until it answers 200 or the limit passes. Returns one result per address."""
    results = []
    for position, address in enumerate(addresses):
        url = health_url(address, ai=position > 0)
        started = now()
        tries = 0
        ok = False
        while True:
            tries += 1
            try:
                ok = get(url, REQUEST_TIMEOUT) == 200
            except (OSError, ValueError):
                ok = False
            if ok or now() - started >= limit_seconds:
                break
            sleep(RETRY_SECONDS)
        results.append({'url': url, 'ok': ok, 'tries': tries, 'seconds': int(now() - started)})
    return results


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Wake the sleeping services before a demonstration.')
    parser.add_argument('api', help='the API address, for example https://ssms-api-cmqa.onrender.com')
    parser.add_argument('ai', nargs='*', help='the disease check service address, if you want it awake too')
    args = parser.parse_args(argv)
    try:
        results = warm_up([args.api, *args.ai])
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2
    for result in results:
        word = 'ready' if result['ok'] else 'NOT ANSWERING'
        print(f"{word:>14}  {result['seconds']:>4} s  {result['tries']:>3} tries  {result['url']}")
    return 0 if all(r['ok'] for r in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
