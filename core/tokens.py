from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


def revoke_all_refresh_tokens(user) -> int:
    """Sign a user out everywhere. Returns how many sessions this call ended.

    The access token each session holds still works until it expires, which is why access tokens
    are short. After that nothing can renew it.
    """
    count = 0
    for outstanding in OutstandingToken.objects.filter(user=user):
        _, created = BlacklistedToken.objects.get_or_create(token=outstanding)
        count += int(created)
    return count
