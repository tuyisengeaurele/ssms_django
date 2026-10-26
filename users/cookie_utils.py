from django.conf import settings

REFRESH_COOKIE = 'ssms_refresh'
# The cookie lives exactly as long as the refresh token it carries.
REFRESH_MAX_AGE = int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())


def set_refresh_cookie(response, refresh_token: str):
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite='Lax',
        max_age=REFRESH_MAX_AGE,
    )


def clear_refresh_cookie(response):
    response.delete_cookie(REFRESH_COOKIE)
