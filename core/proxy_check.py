"""Which forwarding headers can be trusted for a visitor's address, learned from the live site.

TEMPORARY. A visitor who writes their own X-Forwarded-For was counted as that address, through the site and straight at the host. To fix
that on evidence, this says for each forwarding header whether the caller's own address (named in `?me=`) is in it, whether it is
first or last, and whether a forged address (the documentation range 203.0.113.0/24, which tests use) got through. It never prints an
address and never the secret. Remove it when the header to trust is settled.
"""
import ipaddress
import re

from django.conf import settings
from django.http import JsonResponse

from .net import _came_through_the_site, get_client_ip

WATCH = [
    'x-forwarded-for', 'forwarded', 'x-real-ip', 'true-client-ip', 'cf-connecting-ip', 'x-vercel-forwarded-for', 'x-vercel-id',
    'x-vercel-ip-country', 'x-forwarded-host', 'x-ssms-edge',
]
_FORGED = ipaddress.ip_network('203.0.113.0/24')
_SPLIT = re.compile(r'[,;\s]+')


def _address(text):
    try:
        return ipaddress.ip_address(text)
    except ValueError:
        return None


def _entries(raw: str) -> list:
    """The addresses in a header value, whether it is a list of addresses or the standard `for=` form. Anything else is skipped."""
    found = []
    for part in _SPLIT.split(raw or ''):
        part = part.strip().strip('"')
        if part.lower().startswith('for='):
            part = part[4:].strip('"[]')
        address = _address(part)
        if address is not None:
            found.append(address)
    return found


def proxy_check(request):
    me = _address(request.GET.get('me', '').strip())
    headers = {}
    for name in WATCH:
        raw = request.META.get('HTTP_' + name.upper().replace('-', '_'))
        if raw is None:
            headers[name] = None
            continue
        entries = _entries(raw)
        headers[name] = {
            'entries': len(entries),
            'hasMe': me is not None and me in entries,
            'firstIsMe': me is not None and bool(entries) and entries[0] == me,
            'lastIsMe': me is not None and bool(entries) and entries[-1] == me,
            'hasForged': any(a.version == 4 and a in _FORGED for a in entries),
        }
    counted = _address(get_client_ip(request) or '')
    return JsonResponse({
        'trustedProxyCount': settings.TRUSTED_PROXY_COUNT,
        'secretSet': bool(settings.EDGE_SECRET),
        'secretSent': 'HTTP_X_SSMS_EDGE' in request.META,
        'secretMatches': _came_through_the_site(request),
        'headers': headers,
        'chosen': {
            'isMe': me is not None and counted == me,
            'isForged': counted is not None and counted.version == 4 and counted in _FORGED,
        },
    })
