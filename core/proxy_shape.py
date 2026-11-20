"""What shape the forwarded headers arrive in, without saying any address.

TEMPORARY. The live API logs a Cloudflare address for every visitor whatever TRUSTED_PROXY_COUNT is (it is 2 on Render and the logs
still show Cloudflare's). To choose the right count, or the right header, the chain has to be seen: how many entries it has, which of
them are Cloudflare's, and which other headers exist. This says that, and only that: the KIND of each address (cloudflare, private,
public, unknown), never the address itself. Remove it when the count is settled.
"""
import ipaddress

from django.conf import settings
from django.http import JsonResponse
from rest_framework.throttling import BaseThrottle

# Cloudflare's published ranges (https://www.cloudflare.com/ips/). They change rarely; this is only for naming a kind.
_CLOUDFLARE = [
    ipaddress.ip_network(net)
    for net in (
        '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
        '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
        '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
        '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
    )
]

# Headers that could carry the visitor's real address, or say who forwarded the request.
_WATCH = [
    'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip', 'true-client-ip',
    'cf-connecting-ip', 'cf-ray', 'x-vercel-forwarded-for', 'x-vercel-id', 'x-vercel-ip-country',
]


def classify(text: str) -> str:
    """cloudflare, private, public, or unknown (not an address)."""
    try:
        address = ipaddress.ip_address((text or '').strip())
    except ValueError:
        return 'unknown'
    if any(address in net for net in _CLOUDFLARE if net.version == address.version):
        return 'cloudflare'
    return 'public' if address.is_global else 'private'


def proxy_shape(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    entries = [classify(part) for part in forwarded.split(',')] if forwarded.strip() else []
    present = [name for name in _WATCH if f'HTTP_{name.upper().replace("-", "_")}' in request.META]
    return JsonResponse({
        'trustedProxyCount': settings.TRUSTED_PROXY_COUNT,
        'forwardedFor': entries,
        'remoteAddr': classify(request.META.get('REMOTE_ADDR', '')),
        'chosen': classify(BaseThrottle().get_ident(request)),
        'headers': present,
    })
