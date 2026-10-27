import hashlib

from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'register'   # 20/minute — see settings.DEFAULT_THROTTLE_RATES


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = 'password_reset'


class ContactRateThrottle(AnonRateThrottle):
    scope = 'contact'   # 5 messages an hour per address


class DeviceKeyThrottle(SimpleRateThrottle):
    """30 readings a minute for each device key. A device that sends no key is counted by its address."""
    scope = 'device'

    def get_cache_key(self, request, view):
        key = request.headers.get('X-Device-Key', '').strip()
        ident = hashlib.sha256(key.encode()).hexdigest() if key else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}
