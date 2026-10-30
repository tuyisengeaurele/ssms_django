"""Rehearse a deployment: ask a running API the questions a first visitor and a first attacker would.

    python scripts/smoke_deploy.py https://api.example.rw --site https://app.example.rw

Local run against the dev server: python scripts/smoke_deploy.py http://localhost:8000 --site http://localhost:5173

Optional, for the sign-in checks, put a throwaway account in the environment (never on the command line):
    SMOKE_EMAIL, SMOKE_PASSWORD
The sign-in checks rotate that account's refresh token and replay an old one, so do not use a real person's account.
--probe-limits sends a burst of wrong logins from random addresses to see the login rate limit answer 429.
The script changes nothing else. It exits with 1 when any check fails.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from urllib.parse import urlparse

REQUIRED_HEADERS = [
    'x-content-type-options', 'x-frame-options', 'content-security-policy', 'permissions-policy', 'referrer-policy',
]
ONE_YEAR = 31536000

# Hosts that many people share. A name under one of these is a site of its own, so two apps there are cross-site.
SHARED_SUFFIXES = (
    'vercel.app', 'onrender.com', 'railway.app', 'up.railway.app', 'netlify.app', 'herokuapp.com', 'pages.dev',
    'github.io', 'fly.dev', 'co.rw', 'ac.rw', 'org.rw', 'gov.rw', 'net.rw',
)


def _lower(headers: dict) -> dict:
    return {name.lower(): value for name, value in headers.items()}


def header_problems(headers: dict, https: bool) -> list[str]:
    seen = _lower(headers)
    problems = [f'missing header {name}' for name in REQUIRED_HEADERS if name not in seen]
    if https:
        hsts = seen.get('strict-transport-security')
        if hsts is None:
            problems.append('missing header strict-transport-security')
        else:
            age = next((part.split('=')[1] for part in hsts.replace(' ', '').split(';') if part.startswith('max-age=')), '0')
            if int(age or 0) < ONE_YEAR:
                problems.append('strict-transport-security lasts less than a year')
    return problems


def site_of(url: str) -> str:
    """The registrable name of a web address: what the browser compares to decide whether two addresses are one site."""
    host = (urlparse(url).hostname or '').lower()
    labels = host.split('.')
    for suffix in sorted(SHARED_SUFFIXES, key=len, reverse=True):
        if host.endswith('.' + suffix):
            own = host[: -(len(suffix) + 1)].split('.')[-1]
            return f'{own}.{suffix}'
    return '.'.join(labels[-2:])


def cookie_problems(set_cookie: str, https: bool, site: str | None = None, api: str | None = None) -> list[str]:
    flags = [part.strip().lower() for part in set_cookie.split(';')]
    problems = []
    if 'httponly' not in flags:
        problems.append('cookie is not HttpOnly')
    if https and 'secure' not in flags:
        problems.append('cookie is not Secure')
    samesite = next((flag.split('=')[1] for flag in flags if flag.startswith('samesite=')), None)
    if samesite is None:
        problems.append('cookie has no SameSite')
    elif samesite in ('lax', 'strict') and site and api and site_of(site) != site_of(api):
        problems.append(f'SameSite={samesite.capitalize()} cookie will not be sent: the site and the API are on different sites')
    return problems


def cors_problems(sent: dict, allowed: str, stranger_sent: dict) -> list[str]:
    got, stranger = _lower(sent), _lower(stranger_sent)
    problems = []
    if got.get('access-control-allow-origin') != allowed:
        problems.append('the site origin is not allowed by CORS')
    elif got.get('access-control-allow-credentials') != 'true':
        problems.append('CORS does not allow credentials')
    if stranger.get('access-control-allow-origin') in ('*', 'https://evil.example'):
        problems.append('a stranger origin is allowed by CORS')
    return problems


# ── talking to the API ──────────────────────────────────────────────────────────────────────

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def call(method: str, url: str, body: dict | None = None, headers: dict | None = None):
    """(status, headers, parsed json or None, seconds). Never raises on an HTTP error status."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': 'application/json', **(headers or {})})
    started = time.perf_counter()
    try:
        response = _opener.open(request, timeout=60)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read()
    try:
        parsed = json.loads(raw)
    except ValueError:
        parsed = None
    return response.status if hasattr(response, 'status') else response.code, response.headers, parsed, time.perf_counter() - started


class Report:
    def __init__(self):
        self.failed = 0

    def check(self, name: str, problems: list[str] | str | None, note: str = ''):
        problems = [problems] if isinstance(problems, str) else (problems or [])
        if problems:
            self.failed += 1
            print(f'FAIL  {name}: {"; ".join(problems)}')
        else:
            print(f'ok    {name}{(": " + note) if note else ""}')


def run(base: str, site: str | None, probe_limits: bool) -> int:
    base = base.rstrip('/')
    https = base.startswith('https://')
    report = Report()

    status, headers, _, seconds = call('GET', f'{base}/api/health')
    report.check('health answers 200', None if status == 200 else f'got {status}', f'{seconds:.1f}s')
    if seconds > 5:
        print(f'note  the first answer took {seconds:.0f}s: a host that sleeps will do this to every first visitor')
    report.check('security headers', header_problems(dict(headers.items()), https))

    status, _, _, _ = call('GET', f'{base}/api/farms')
    report.check('a request with no sign in is refused with 401', None if status == 401 else f'got {status}')

    bad = {'email': f'smoke-{uuid.uuid4().hex[:8]}@example.invalid', 'password': 'Not-the-password-1'}
    status, _, _, _ = call('POST', f'{base}/api/auth/login', bad)
    # 429 also proves the limiter and its cache table work. Only a server error is a failure.
    report.check('a wrong login is refused with 401 or 429, not an error', None if status in (401, 429) else
                 f'got {status}. A 500 here usually means the cache table is missing: run createcachetable')

    if site:
        sent = dict(call('OPTIONS', f'{base}/api/auth/token/refresh', headers={
            'Origin': site, 'Access-Control-Request-Method': 'POST'})[1].items())
        stranger = dict(call('OPTIONS', f'{base}/api/auth/token/refresh', headers={
            'Origin': 'https://evil.example', 'Access-Control-Request-Method': 'POST'})[1].items())
        report.check('CORS', cors_problems(sent, site, stranger))

    email, password = os.environ.get('SMOKE_EMAIL'), os.environ.get('SMOKE_PASSWORD')
    if email and password:
        sign_in_checks(report, base, https, site, email, password)
    else:
        print('skip  sign in checks: set SMOKE_EMAIL and SMOKE_PASSWORD for a throwaway account')

    if probe_limits:
        answers = [call('POST', f'{base}/api/auth/login', {'email': f'probe-{n}-{uuid.uuid4().hex[:6]}@example.invalid',
                                                            'password': 'Not-the-password-1'})[0] for n in range(14)]
        report.check('a burst of wrong logins is slowed down with 429', None if 429 in answers else f'answers were {sorted(set(answers))}')

    print('\nAll checks passed.' if not report.failed else f'\n{report.failed} check(s) failed.')
    return 1 if report.failed else 0


def sign_in_checks(report: Report, base: str, https: bool, site: str | None, email: str, password: str):
    status, headers, body, _ = call('POST', f'{base}/api/auth/login', {'email': email, 'password': password})
    if status != 200:
        report.check('sign in with the throwaway account', f'got {status}')
        return
    cookies = headers.get_all('Set-Cookie') or []
    refresh = next((c for c in cookies if c.startswith('ssms_refresh=')), None)
    if refresh is None:
        report.check('refresh cookie is set at sign in', 'no ssms_refresh cookie')
        return
    report.check('refresh cookie flags', cookie_problems(refresh, https, site, base))

    first = refresh.split(';')[0]
    status, headers, _, _ = call('POST', f'{base}/api/auth/token/refresh', {}, {'Cookie': first})
    rotated = next((c for c in (headers.get_all('Set-Cookie') or []) if c.startswith('ssms_refresh=')), None)
    report.check('the refresh cookie renews the sign in and is replaced', None if status == 200 and rotated else f'got {status}')

    status, _, _, _ = call('POST', f'{base}/api/auth/token/refresh', {}, {'Cookie': first})
    report.check('the old refresh cookie is refused after it was replaced', None if status == 401 else f'got {status}')

    if rotated:
        call('POST', f'{base}/api/auth/logout', {}, {'Cookie': rotated.split(';')[0]})
        status, _, _, _ = call('POST', f'{base}/api/auth/token/refresh', {}, {'Cookie': rotated.split(';')[0]})
        report.check('a cookie is refused after sign out', None if status == 401 else f'got {status}')


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Rehearse a deployment against a running API.')
    parser.add_argument('base', help='the API address, for example https://api.example.rw')
    parser.add_argument('--site', help='the address of the website, for the CORS and cookie checks')
    parser.add_argument('--probe-limits', action='store_true', help='send a burst of wrong logins to see 429')
    args = parser.parse_args(argv)
    return run(args.base, args.site, args.probe_limits)


if __name__ == '__main__':
    sys.exit(main())
