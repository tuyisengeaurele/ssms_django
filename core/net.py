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


def get_client_ip(request) -> str | None:
    """The caller's address, believing X-Forwarded-For only as far as TRUSTED_PROXY_COUNT allows.

    With no trusted proxy the header is ignored, because any client can write it. With a count of N the real client is
    the N-th entry from the right, after the hops of the hosting path are stepped over: Cloudflare's addresses and
    private ones sit at the right end of the chain and are not counted. Through the site the chain is the visitor,
    Vercel, Cloudflare, the balancer; straight at the host it is the visitor, Cloudflare, the balancer. With a count of 2
    both give the visitor.

    A caller who goes straight to the host and writes an extra entry at the left of the header can still choose the
    address it is counted as. That only lets it spread its own requests over several limits, and the sign in lockout
    counts by email as well.
    """
    remote = request.META.get('REMOTE_ADDR')
    trusted = getattr(settings, 'TRUSTED_PROXY_COUNT', 0)
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if trusted <= 0 or not forwarded:
        return remote
    hops = [hop.strip() for hop in forwarded.split(',') if hop.strip()]
    while hops and is_infrastructure(hops[-1]):
        hops.pop()
    if not hops:
        return remote
    return hops[-min(trusted, len(hops))]
