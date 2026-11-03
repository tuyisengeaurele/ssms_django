from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


def revoke_all_refresh_tokens(user, reason: str = 'signed_out_all') -> int:
    """Sign a user out everywhere. Returns how many refresh tokens this call put on the blacklist.

    The access token each session holds stops working at its next request, because its session is ended here.
    """
    from users.models import UserSession  # users imports core, so this waits until it is called

    count = 0
    for outstanding in OutstandingToken.objects.filter(user=user):
        _, created = BlacklistedToken.objects.get_or_create(token=outstanding)
        count += int(created)
    UserSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now(), revoked_reason=reason)
    return count
