"""Support access, the admin's side. The person's side is further down in this module.

Every lookup is scoped to the caller, so an id that is not theirs is "not found" and says nothing more.
"""
import logging

from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.mail import send_email_async
from core.mfa_guard import require_recent_mfa
from core.permissions import RolePermission
from core.throttles import SupportRequestThrottle
from core.utils import api_error, api_success
from logs.security import record_security_event

from . import services
from .models import SupportAccess
from .notify import SUBJECT, request_email
from .rows import admin_row
from .services import SupportError

User = get_user_model()
logger = logging.getLogger(__name__)

NOT_FOUND = 'We could not find that request.'
RECENT_LIMIT = 5


def _fail(error: SupportError):
    """The page reads `code` to tell the cases apart, as it does for the second factor."""
    response = api_error(error.message, error.status)
    response.data['code'] = error.code
    return response


def _record(request, kind: str, access: SupportAccess, detail: str, action: str = 'OTHER') -> None:
    """One security event and one audit entry. Never the token, and never a code."""
    record_security_event(kind, request, detail=detail)
    log_action(request, action, 'SupportAccess', access.id, detail)


class _AdminView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'support_access'

    def found(self, request, pk):
        """The caller's own request with its time limits applied, or None."""
        access = SupportAccess.objects.filter(pk=pk, admin=request.user).first()
        return services.settle(access) if access else None


class SupportRequestView(_AdminView):
    """POST /api/support-access: ask a farmer or supervisor to let support look at their account."""
    actions = {'post': 'request'}
    throttle_classes = [SupportRequestThrottle]

    def post(self, request):
        require_recent_mfa(request)
        data = request.data
        person = User.objects.filter(pk=str(data.get('person_id') or '')).first()
        if person is None:
            return api_error('We could not find that person.', 404)
        try:
            minutes = int(data.get('minutes'))
        except (TypeError, ValueError):
            minutes = -1
        try:
            access = services.ask(request.user, person, reason=data.get('reason'), minutes=minutes, mode=data.get('mode'))
        except SupportError as error:
            return _fail(error)
        _record(request, 'support_requested', access, f'Asked {person.email} for {access.requested_mode} access, {access.minutes} minutes', 'CREATE')
        try:
            send_email_async(SUBJECT, [person.email], request_email(access))
        except Exception:
            # The request stands. The person sees it in the app, and the mail is a courtesy.
            logger.exception('Could not send the support access request mail')
        return api_success(admin_row(access), 'Request sent.', 201)


class SupportMineView(_AdminView):
    """GET /api/support-access/mine: the admin's open request and the last few."""
    actions = {'get': 'read'}

    def get(self, request):
        rows = [services.settle(row) for row in SupportAccess.objects.filter(admin=request.user)[:RECENT_LIMIT]]
        open_row = next((r for r in rows if r.status in SupportAccess.OPEN), None)
        return api_success({'open': admin_row(open_row) if open_row else None, 'recent': [admin_row(r) for r in rows]})


class SupportDetailView(_AdminView):
    """GET /api/support-access/<id>: one request. The admin's page asks every few seconds while waiting for an answer."""
    actions = {'get': 'read'}

    def get(self, request, pk):
        access = self.found(request, pk)
        return api_success(admin_row(access)) if access else api_error(NOT_FOUND, 404)


class SupportCancelView(_AdminView):
    """POST /api/support-access/<id>/cancel: withdraw a request that has not started."""
    actions = {'post': 'cancel'}

    def post(self, request, pk):
        access = self.found(request, pk)
        if access is None:
            return api_error(NOT_FOUND, 404)
        try:
            services.cancel(access, request.user)
        except SupportError as error:
            return _fail(error)
        _record(request, 'support_ended', access, f'Withdrawn before it started, for {access.person_email}')
        return api_success(admin_row(access), 'Request withdrawn.')


class SupportStartView(_AdminView):
    """POST /api/support-access/<id>/start: begin an allowed visit. Needs a fresh code, as entering an account should."""
    actions = {'post': 'start'}

    def post(self, request, pk):
        require_recent_mfa(request)
        access = self.found(request, pk)
        if access is None:
            return api_error(NOT_FOUND, 404)
        try:
            token = services.start(access, request.user, getattr(request, 'session_id', None) or '')
        except SupportError as error:
            return _fail(error)
        _record(request, 'support_started', access, f'Started {access.granted_mode} access to {access.person_email}')
        return api_success({'access': admin_row(access), 'token': token}, 'Support access started.')


class SupportTokenView(_AdminView):
    """POST /api/support-access/<id>/token: a new token for a visit that is running, after the page lost the old one."""
    actions = {'post': 'token'}

    def post(self, request, pk):
        access = self.found(request, pk)
        if access is None:
            return api_error(NOT_FOUND, 404)
        try:
            token = services.reissue_token(access, request.user)
        except SupportError as error:
            return _fail(error)
        return api_success({'access': admin_row(access), 'token': token})


class SupportEndView(_AdminView):
    """POST /api/support-access/<id>/end: the admin stops, at once. Ending a visit that is over already changes nothing."""
    actions = {'post': 'end'}

    def post(self, request, pk):
        access = self.found(request, pk)
        if access is None:
            return api_error(NOT_FOUND, 404)
        if services.end_support_access(access, 'admin', 'admin_ended'):
            _record(request, 'support_ended', access, f'Ended by the admin, for {access.person_email}')
        return api_success(admin_row(access), 'Support access ended.')
