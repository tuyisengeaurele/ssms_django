from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'register'   # 20/minute — see settings.DEFAULT_THROTTLE_RATES


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = 'password_reset'
