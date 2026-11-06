import hashlib

from django.core.cache import caches
from rest_framework.throttling import AnonRateThrottle as _AnonRateThrottle
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.throttling import UserRateThrottle as _UserRateThrottle

# Rate limit counters live in memory, not in the database cache. In the database every request cost six round trips to
# Supabase (read, count, savepoint, check, write, release). The cost of memory is that each API process counts for
# itself and a restart starts the counts again. The API runs one process (WEB_CONCURRENCY=1), so the limits are exact
# today. With more processes each one allows the full rate, so raise nothing without reading this. Sign in lockout,
# code challenges and stream tickets are different: they must survive a restart, so they stay in the database cache.
THROTTLE_CACHE = caches['throttle']


class AnonRateThrottle(_AnonRateThrottle):
    cache = THROTTLE_CACHE


class UserRateThrottle(_UserRateThrottle):
    cache = THROTTLE_CACHE


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class MfaRateThrottle(AnonRateThrottle):
    scope = 'mfa'   # second factor codes and set-up, 10 a minute per address


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'register'   # 20/minute — see settings.DEFAULT_THROTTLE_RATES


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = 'password_reset'


class ContactRateThrottle(AnonRateThrottle):
    scope = 'contact'   # 5 messages an hour per address


class InvitationRateThrottle(AnonRateThrottle):
    scope = 'invitation'   # a stranger asking about invitation links, 20 a minute per address


class LotRateThrottle(AnonRateThrottle):
    scope = 'lot'   # a stranger opening lot pages, 30 a minute per address


class ReportRateThrottle(UserRateThrottle):
    scope = 'report'   # a PDF report is built on demand, 20 a minute per person


class ExportRateThrottle(UserRateThrottle):
    """10 downloads a minute per person. A list that can also be exported is counted only when it is exported."""
    scope = 'export'

    def allow_request(self, request, view):
        if request.query_params.get('export') not in ('csv', 'pdf'):
            return True
        return super().allow_request(request, view)


class DetectionRateThrottle(UserRateThrottle):
    scope = 'detection'   # a photo check calls the AI service, 20 a minute per person


class HealthTestRateThrottle(UserRateThrottle):
    scope = 'health_test'   # a test button really calls a service, 5 a minute per person


class SessionsRateThrottle(UserRateThrottle):
    scope = 'sessions'   # a person looking at, renaming or signing out their devices, 30 a minute


class DeviceKeyThrottle(SimpleRateThrottle):
    """30 readings a minute for each device key. A device that sends no key is counted by its address."""
    scope = 'device'
    cache = THROTTLE_CACHE

    def get_cache_key(self, request, view):
        key = request.headers.get('X-Device-Key', '').strip()
        ident = hashlib.sha256(key.encode()).hexdigest() if key else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}
