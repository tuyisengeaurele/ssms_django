"""The signed in devices of the person who asks. Nobody sees or touches another person's."""
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.throttles import SessionsRateThrottle
from core.utils import api_error, api_success

from .cookie_utils import clear_refresh_cookie
from .models import UserSession
from .sessions import end_all_but, idle_limit, revoke

LIST_LIMIT = 50


def _row(session: UserSession, current_id) -> dict:
    return {
        'id': session.id,
        'device_label': session.device_label,
        'browser': session.browser,
        'os': session.os,
        'is_installed_app': session.is_installed_app,
        'created_at': session.created_at,
        'last_used_at': session.last_used_at,
        'is_current': session.id == current_id,
    }


def _alive(user):
    return UserSession.objects.filter(user=user, revoked_at__isnull=True, expires_at__gt=timezone.now())


class _SessionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [SessionsRateThrottle]

    def current_id(self, request):
        return getattr(request, 'session_id', None)


class SessionPingView(_SessionView):
    """POST /api/auth/session/ping: somebody is still here. Counts as activity and says how long the sign in may sit idle.

    Reading a long page makes no request of its own, so the page sends this now and then. An idle session is already
    refused before this view runs, so a ping can never bring one back.
    """

    def post(self, request):
        limit = idle_limit(request.user)
        session_id = self.current_id(request)
        if session_id:
            UserSession.objects.filter(pk=session_id).update(last_activity_at=timezone.now())
        seconds = int(limit.total_seconds()) if limit else None
        return api_success({'idle_limit_seconds': seconds, 'idle_seconds_left': seconds})


class SessionListView(_SessionView):
    """GET /api/auth/sessions: the live devices, the most recently used first."""

    def get(self, request):
        found = _alive(request.user).order_by('-last_used_at')[:LIST_LIMIT]
        return api_success([_row(s, self.current_id(request)) for s in found])


class SessionDetailView(_SessionView):
    """DELETE signs a device out."""

    def _own(self, request, pk):
        return _alive(request.user).filter(pk=pk).first()

    def delete(self, request, pk):
        session = self._own(request, pk)
        if session is None:
            return api_error("We couldn't find that device.", 404)
        revoke(session, 'revoked')
        log_action(request, 'LOGOUT', 'User', request.user.pk, f'Signed out device: {session.device_label}')
        response = api_success(None, 'Device signed out.')
        if session.id == self.current_id(request):
            clear_refresh_cookie(response)
        return response


class SessionRevokeOthersView(_SessionView):
    """POST /api/auth/sessions/revoke-others: sign out every device but this one."""

    def post(self, request):
        sid = self.current_id(request)
        kept = _alive(request.user).filter(pk=sid).first() if sid else None
        ended = end_all_but(request.user, kept, 'revoked')
        log_action(request, 'LOGOUT', 'User', request.user.pk, f'Signed out {ended} other device(s)')
        return api_success({'revoked': ended}, 'Other devices signed out.')
