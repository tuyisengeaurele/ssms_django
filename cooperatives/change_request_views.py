"""Cooperative change requests over HTTP. The rules are in `cooperatives/change_requests.py`.

A farmer or supervisor lists the cooperatives by name (`options`), asks, reads their own request and takes it back. The SSMS
team lists the requests with the person, the number, from, to and the reason, and decides.
"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.permissions import RolePermission
from core.utils import api_error, api_success
from users.models import Role, User
from users.phone_visibility import person_row, visible_phone_ids

from . import change_requests
from .change_requests import ChangeRequestError
from .models import Cooperative, CooperativeChangeRequest

Status = CooperativeChangeRequest.Status


def _side(cooperative):
    return {'id': cooperative.pk, 'name': cooperative.name} if cooperative else None


def _name(cooperative) -> str:
    return cooperative.name if cooperative else 'no cooperative'


def _mine(row) -> dict:
    return {
        'id': row.pk, 'status': row.status, 'reason': row.reason, 'from': _side(row.from_cooperative), 'to': _side(row.to_cooperative),
        'decision_note': row.decision_note, 'created_at': row.created_at, 'decided_at': row.decided_at,
    }


def _refuse(error: ChangeRequestError):
    return api_error(error.message, error.status, code=error.code)


class CooperativeOptionsView(APIView):
    """GET /api/cooperatives/options: the names a person can ask to join. Nothing else about them (no members, no counts)."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'cooperative_options'

    def get(self, request):
        rows = Cooperative.objects.filter(is_active=True).order_by('name').values('id', 'name')
        return api_success([{'id': r['id'], 'name': r['name']} for r in rows])


class AccountCooperativeRequestView(APIView):
    """GET the open request, or the last decided one. POST asks. DELETE takes the open one back."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'cooperative_requests'
    actions = {'get': 'read', 'post': 'create', 'delete': 'withdraw'}

    def get(self, request):
        rows = CooperativeChangeRequest.objects.filter(user=request.user).select_related('from_cooperative', 'to_cooperative')
        row = rows.filter(status=Status.REQUESTED).first() or rows.filter(status__in=[Status.APPROVED, Status.DECLINED]).order_by('-decided_at').first()
        return api_success(_mine(row) if row else None)

    def post(self, request):
        target = request.data.get('to_cooperative_id') or None
        try:
            row = change_requests.ask(request.user, target, request.data.get('reason'))
        except ChangeRequestError as error:
            return _refuse(error)
        log_action(
            request, 'CREATE', 'CooperativeChangeRequest', row.pk,
            f'Asked to move from {_name(row.from_cooperative)} to {_name(row.to_cooperative)}: {row.reason}',
        )
        return api_success(_mine(row), 'Your request was sent to the SSMS team.', 201)

    def delete(self, request):
        row = change_requests.open_for(request.user)
        if row is None:
            return api_error(change_requests.NOTHING_TO_WITHDRAW, 404, code='coop_nothing_to_withdraw')
        try:
            change_requests.withdraw(row, request.user)
        except ChangeRequestError as error:
            return _refuse(error)
        log_action(request, 'UPDATE', 'CooperativeChangeRequest', row.pk, 'Withdrew the request to change cooperative')
        return api_success(None, 'Your request was withdrawn.')


def _only_supervisor(row) -> bool:
    """The person is a supervisor and nobody else supervises the cooperative they would leave."""
    if row.user.role != Role.SUPERVISOR or not row.from_cooperative_id:
        return False
    others = User.objects.filter(role=Role.SUPERVISOR, cooperative_id=row.from_cooperative_id, is_active=True).exclude(pk=row.user_id)
    return not others.exists()


class AdminCooperativeRequestListView(APIView):
    """GET /api/admin/cooperative-requests?status=requested|approved|declined|withdrawn (open ones by default)."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'cooperative_requests'
    actions = {'get': 'review'}

    def get(self, request):
        wanted = request.query_params.get('status') or Status.REQUESTED
        if wanted not in Status.values:
            return api_error('Please check what you entered and try again.', 422, code='invalid_input')
        order = 'created_at' if wanted == Status.REQUESTED else '-decided_at'
        rows = list(
            CooperativeChangeRequest.objects.filter(status=wanted)
            .select_related('user', 'from_cooperative', 'to_cooperative', 'decided_by').order_by(order)
        )
        visible = visible_phone_ids(request.user, [r.user_id for r in rows])
        data = [
            {
                **_mine(r),
                'person': person_row(request.user, r.user, visible, role=r.user.role),
                'only_supervisor': _only_supervisor(r),
                'decided_by': r.decided_by.name if r.decided_by else None,
            }
            for r in rows
        ]
        return api_success({'requests': data, 'count': len(data)})


class AdminCooperativeRequestDecisionView(APIView):
    """POST /api/admin/cooperative-requests/<id>/decision {decision: approve | decline, note}."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'cooperative_requests'
    actions = {'post': 'decide'}

    def post(self, request, pk):
        row = CooperativeChangeRequest.objects.select_related('user', 'from_cooperative', 'to_cooperative').filter(pk=pk).first()
        if row is None:
            return api_error('We could not find that request.', 404, code='not_found')
        decision = request.data.get('decision')
        try:
            decided = change_requests.decide(row, request.user, decision, request.data.get('note') or '')
        except ChangeRequestError as error:
            return _refuse(error)
        verb = 'Approved' if decision == 'approve' else 'Declined'
        note = f': {decided.decision_note}' if decided.decision_note else ''
        log_action(
            request, 'UPDATE', 'CooperativeChangeRequest', decided.pk,
            f'{verb} the move of {row.user.name} from {_name(row.from_cooperative)} to {_name(row.to_cooperative)}{note}',
        )
        return api_success({'id': decided.pk, 'status': decided.status}, 'Decided.')
