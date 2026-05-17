from django.conf import settings

REFRESH_COOKIE = 'ssms_refresh'
REFRESH_MAX_AGE = 30 * 24 * 60 * 60  # 30 days


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
