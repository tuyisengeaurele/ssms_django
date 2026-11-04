import hashlib

from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


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


class SessionsRateThrottle(UserRateThrottle):
    scope = 'sessions'   # a person looking at, renaming or signing out their devices, 30 a minute


class DeviceKeyThrottle(SimpleRateThrottle):
    """30 readings a minute for each device key. A device that sends no key is counted by its address."""
    scope = 'device'

    def get_cache_key(self, request, view):
        key = request.headers.get('X-Device-Key', '').strip()
        ident = hashlib.sha256(key.encode()).hexdigest() if key else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}
