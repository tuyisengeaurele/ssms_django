from django.conf import settings
from django.core.checks import Error, Tags, Warning, register


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


@register(Tags.security, deploy=True)
def check_edge_secret(app_configs, **kwargs):
    """Without the shared secret the API cannot tell the website's word about a visitor's address from a visitor's own forged header,
    so anyone can choose the address they are counted as and slip past every limit by address."""
    if settings.DEBUG:
        return []
    secret = settings.EDGE_SECRET
    if not secret:
        return [Warning(
            'EDGE_SECRET is not set on a live site.',
            hint='Make one with: python -c "import secrets; print(secrets.token_urlsafe(32))". Set it as EDGE_SECRET here and in the environment '
                 'of the website (docs/deploy-runbook.md, section 23). Until then a visitor can choose the address they are counted as.',
            id='ssms.W002',
        )]
    if len(secret) < 32:
        return [Warning(
            'EDGE_SECRET is shorter than 32 characters.',
            hint='A short secret can be guessed. Make a new one with: python -c "import secrets; print(secrets.token_urlsafe(32))".',
            id='ssms.W003',
        )]
    return []


@register(Tags.security, deploy=True)
def check_mfa_key(app_configs, **kwargs):
    """Admin second factor secrets are encrypted with this key. Without it on a live site no admin could sign in, so the
    deploy stops here, before a new copy replaces the one that is running."""
    if settings.DEBUG:
        return []
    from cryptography.fernet import Fernet
    try:
        Fernet(settings.MFA_ENCRYPTION_KEY)
    except (ValueError, TypeError):
        return [Error(
            'MFA_ENCRYPTION_KEY is missing or is not a valid key.',
            hint='Make one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" '
                 'and set it as MFA_ENCRYPTION_KEY. Keep a copy in a password manager.',
            id='ssms.E001',
        )]
    return []
