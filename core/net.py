from django.conf import settings


def get_client_ip(request) -> str | None:
    """The caller's address, believing X-Forwarded-For only as far as TRUSTED_PROXY_COUNT allows.

    With no trusted proxy the header is ignored, because any client can write it. With N trusted
    proxies in front of the app, the real client is the N-th entry from the right.
    """
    remote = request.META.get('REMOTE_ADDR')
    trusted = getattr(settings, 'TRUSTED_PROXY_COUNT', 0)
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if trusted <= 0 or not forwarded:
        return remote
    hops = [hop.strip() for hop in forwarded.split(',') if hop.strip()]
    if not hops:
        return remote
    return hops[-min(trusted, len(hops))]
