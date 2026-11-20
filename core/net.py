import hmac
import ipaddress

from django.conf import settings

# Cloudflare's published ranges (https://www.cloudflare.com/ips/). Render puts Cloudflare in front of every service, so its
# address is in the forwarded chain whatever the visitor does. The list changes rarely.
_CLOUDFLARE = [
    ipaddress.ip_network(net)
    for net in (
        '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
        '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
        '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
        '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
    )
]

# The host's own balancers and internal hops. Listed by range, not by `is_private`, which also covers the documentation
# ranges that tests and docs use as stand-ins for visitors.
_PRIVATE = [
    ipaddress.ip_network(net)
    for net in (
        '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
        'fc00::/7', '::1/128', 'fe80::/10',
    )
]


def is_infrastructure(text: str) -> bool:
    """True for an address of the hosting path itself (Cloudflare, or a private hop), never for a visitor."""
    try:
        address = ipaddress.ip_address((text or '').strip())
    except ValueError:
        return False
    return any(address in net for net in _CLOUDFLARE + _PRIVATE if net.version == address.version)


def _is_address(text: str) -> bool:
    try:
        ipaddress.ip_address(text)
    except ValueError:
        return False
    return True


def _came_through_the_site(request) -> bool:
    """True when the request carries the secret only the website knows. Compared in constant time, as bytes, so odd characters are no problem."""
    secret = getattr(settings, 'EDGE_SECRET', '')
    sent = request.META.get('HTTP_X_SSMS_EDGE', '')
    return bool(secret) and bool(sent) and hmac.compare_digest(sent.encode('utf-8'), secret.encode('utf-8'))


def _hops_after_the_hosting_path(request) -> list[str]:
    """The forwarded chain without the hops of the hosting path at its right end (Cloudflare's addresses and private ones)."""
    hops = [hop.strip() for hop in (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',') if hop.strip()]
    while hops and is_infrastructure(hops[-1]):
        hops.pop()
    return hops


def get_client_ip(request) -> str | None:
    """The address a request is counted as, for the audit and security logs and for every limit by address.

    With no trusted proxy (TRUSTED_PROXY_COUNT 0) the forwarded headers are ignored, because anyone can write them.

    With EDGE_SECRET set, only the website can say who a visitor is. A request that carries the secret is counted by the address the
    website reports (X-Vercel-Forwarded-For). Any other request is counted by the last address in the chain that is not part of the hosting
    path: the address that connected to Cloudflare, which no header can change. A visitor who writes an X-Forwarded-For of their own,
    through the site or straight at the host, is counted as themselves.

    Without EDGE_SECRET (the older rule) the real client is the N-th entry from the right, once Cloudflare's addresses and private ones at
    the right end are stepped over. That can be fooled: an extra entry at the left of the header chooses the address, and a visitor
    who sends one through the site is believed too. The deploy check warns while the secret is not set.
    """
    remote = request.META.get('REMOTE_ADDR')
    trusted = getattr(settings, 'TRUSTED_PROXY_COUNT', 0)
    if trusted <= 0:
        return remote
    hops = _hops_after_the_hosting_path(request)

    if getattr(settings, 'EDGE_SECRET', ''):
        if _came_through_the_site(request):
            reported = request.META.get('HTTP_' + settings.EDGE_CLIENT_IP_HEADER.upper().replace('-', '_'), '')
            first = reported.split(',')[0].strip()
            if _is_address(first):
                return first
        return hops[-1] if hops else remote

    if not hops:
        return remote
    return hops[-min(trusted, len(hops))]
