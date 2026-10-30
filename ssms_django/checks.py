from django.conf import settings
from django.core.checks import Tags, Warning, register


@register(Tags.security, deploy=True)
def check_trusted_proxy(app_configs, **kwargs):
    """Behind a host's proxy, REMOTE_ADDR is the proxy. With no trusted proxy, every visitor shares one address,
    so the login limit and the audit log's IP column count the whole site as one person."""
    if settings.DEBUG or settings.TRUSTED_PROXY_COUNT > 0:
        return []
    return [Warning(
        'TRUSTED_PROXY_COUNT is 0 on a live site.',
        hint='Set TRUSTED_PROXY_COUNT=1 when one proxy (Render, Railway, Vercel) sits in front of the API, '
             'so rate limits and the audit log see each visitor\'s own address.',
        id='ssms.W001',
    )]
