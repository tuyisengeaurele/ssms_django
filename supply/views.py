"""Allowance over HTTP: /api/supply/allowance, /api/supply/allowance/requests and /api/supply/settings.

A farmer reaches only their own card and requests. A supervisor reaches only their cooperative's, and what is outside it is
"not found". The rules themselves live in `supply/allowance.py`.
"""
from decimal import Decimal, InvalidOperation

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from cooperatives.team_views import team_cooperative
from core.permissions import RolePermission
from core.utils import api_error, api_success
from users.models import User

from . import allowance, notify
from .capacity import farmer_capacity_boxes
from .models import AllowanceChange, AllowanceRequest, SupplySettings

HISTORY_LENGTH = 20
M2_PER_BOX_MAX = Decimal('1000')


def _fail(error: allowance.AllowanceError):
    """The page reads `code` to tell the cases apart, as it does for room approval."""
    return api_error(error.message, error.status, code=error.code)


def _first(data, *names):
    for name in names:
        if name in data:
            return data[name]
    return None


def _scoped_request(user, request_id):
    """The request, or None when it is missing or outside what this person reaches."""
    found = AllowanceRequest.objects.select_related('farmer').filter(pk=request_id)
    if user.role == 'SUPERVISOR':
        found = found.filter(cooperative_id=user.cooperative_id) if user.cooperative_id else found.none()
    return found.first()


def _card(farmer) -> dict:
    now = allowance.current(farmer)
    history = AllowanceChange.objects.filter(farmer=farmer, cooperative_id=farmer.cooperative_id).select_related('decided_by')[:HISTORY_LENGTH]
    waiting = AllowanceRequest.objects.filter(farmer=farmer, status=AllowanceRequest.Status.REQUESTED).first()
    return {
        'boxes': now['boxes'],
        'source': now['source'],
        'since': now['since'],
        'history': [
            {
                'old_boxes': c.old_boxes, 'new_boxes': c.new_boxes, 'kind': c.kind, 'reason': c.reason,
                'by_name': c.decided_by.name if c.decided_by else None, 'at': c.decided_at,
            }
            for c in history
        ],
        'open_request': {'id': waiting.pk, 'boxes_asked': waiting.boxes_asked, 'reason': waiting.reason, 'created_at': waiting.created_at} if waiting else None,
        'capacity_boxes': farmer_capacity_boxes(farmer),
        'starter_boxes': SupplySettings.for_cooperative(farmer.cooperative).starter_boxes if farmer.cooperative_id else None,
    }


class AllowanceView(APIView):
    """GET /api/supply/allowance, the farmer's own card: the amount, where it came from, the history and any open request."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'allowance'

    def get(self, request):
        return api_success(_card(request.user))


class AllowanceRequestListView(APIView):
    """GET lists the requests that wait (staff). POST is a farmer asking for a different amount."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'allowance'
    actions = {'get': 'review_list', 'post': 'request'}

    def get(self, request):
        user = request.user
        waiting = AllowanceRequest.objects.filter(status=AllowanceRequest.Status.REQUESTED).select_related('farmer')
        if user.role == 'SUPERVISOR':
            if not user.cooperative_id:
                return api_error('You are not part of a cooperative yet.', 403)
            waiting = waiting.filter(cooperative_id=user.cooperative_id)
        elif request.query_params.get('cooperativeId'):
            waiting = waiting.filter(cooperative_id=request.query_params['cooperativeId'])
        rows = [
            {
                'id': r.pk,
                'boxes_asked': r.boxes_asked,
                'current_boxes': allowance.current(r.farmer)['boxes'],
                'reason': r.reason,
                'created_at': r.created_at,
                'farmer': {'id': r.farmer_id, 'name': r.farmer.name, 'email': r.farmer.email},
            }
            for r in waiting.order_by('created_at')
        ]
        return api_success({'requests': rows, 'count': len(rows)})

    def post(self, request):
        try:
            row = allowance.ask(request.user, _first(request.data, 'boxes_asked', 'boxesAsked'), request.data.get('reason'))
        except allowance.AllowanceError as error:
            return _fail(error)
        log_action(request, 'CREATE', 'AllowanceRequest', row.pk, f'Asked for {row.boxes_asked} boxes: {row.reason}')
        notify.tell_reviewers(row)
        return api_success({'id': row.pk, 'boxes_asked': row.boxes_asked, 'status': row.status}, 'Request sent.', 201)


class AllowanceRequestDetailView(APIView):
    """DELETE withdraws the farmer's own waiting request."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'allowance'
    actions = {'delete': 'withdraw'}

    def delete(self, request, pk):
        row = AllowanceRequest.objects.filter(pk=pk, farmer=request.user).first()
        if row is None:
            return api_error('We could not find that request.', 404)
        try:
            allowance.withdraw(row, request.user)
        except allowance.AllowanceError as error:
            return _fail(error)
        log_action(request, 'UPDATE', 'AllowanceRequest', row.pk, f'Withdrew the request for {row.boxes_asked} boxes')
        return api_success(None, 'Request withdrawn.')


class AllowanceDecisionView(APIView):
    """POST /api/supply/allowance/requests/<id>/decision {decision: 'approve' | 'decline', boxes, note}."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'allowance'
    actions = {'post': 'decide'}

    def post(self, request, pk):
        row = _scoped_request(request.user, pk)
        if row is None:
            return api_error('We could not find that request.', 404)
        decision = request.data.get('decision')
        try:
            decided = allowance.decide(row, request.user, decision, request.data.get('boxes'), request.data.get('note') or '')
        except allowance.AllowanceError as error:
            return _fail(error)
        if decision == 'approve':
            detail = f'Approved {decided.boxes_granted} boxes for {row.farmer.name} (asked for {decided.boxes_asked})'
        else:
            detail = f'Declined the request of {row.farmer.name} for {decided.boxes_asked} boxes: {decided.decision_note}'
        log_action(request, 'UPDATE', 'AllowanceRequest', decided.pk, detail)
        notify.tell_farmer(decided)
        return api_success({'id': decided.pk, 'status': decided.status, 'boxes_granted': decided.boxes_granted}, 'Decided.')


class AllowanceFarmerView(APIView):
    """PATCH /api/supply/allowance/farmers/<id> {boxes, reason}. A supervisor lowers, an admin sets any amount."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'allowance'
    actions = {'patch': 'set'}

    def patch(self, request, pk):
        user = request.user
        farmers = User.objects.filter(pk=pk, role='FARMER', is_active=True)
        if user.role == 'SUPERVISOR':
            farmers = farmers.filter(cooperative_id=user.cooperative_id) if user.cooperative_id else farmers.none()
        farmer = farmers.first()
        if farmer is None:
            return api_error("We couldn't find that farmer.", 404)
        before = allowance.current(farmer)['boxes']
        change = allowance.set_as_admin if user.role == 'ADMIN' else allowance.lower
        try:
            row = change(farmer, request.data.get('boxes'), request.data.get('reason'), by=user)
        except allowance.AllowanceError as error:
            return _fail(error)
        verb = 'Lowered' if row.boxes < before else 'Raised'
        reason = str(request.data.get('reason') or '').strip()
        log_action(request, 'UPDATE', 'Allowance', row.pk, f'{verb} the allowance of {farmer.name} from {before} to {row.boxes} boxes: {reason}')
        notify.tell_farmer_of_change(farmer, before, row.boxes, reason, user)
        return api_success({'boxes': row.boxes}, 'Allowance changed.')


def _settings_row(settings_row: SupplySettings) -> dict:
    return {'starter_boxes': settings_row.starter_boxes, 'm2_per_box': settings_row.m2_per_box}


class SupplySettingsView(APIView):
    """GET the cooperative's egg supply settings (staff). PATCH changes them (admin only)."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'supply_settings'

    def get(self, request):
        coop, err = team_cooperative(request)
        if err:
            return err
        return api_success(_settings_row(SupplySettings.for_cooperative(coop)))

    def patch(self, request):
        coop, err = team_cooperative(request)
        if err:
            return err
        data = request.data
        row = SupplySettings.for_cooperative(coop)
        changes = {}
        errors = {}
        if 'starter_boxes' in data or 'starterBoxes' in data:
            try:
                changes['starter_boxes'] = allowance.valid_boxes(_first(data, 'starter_boxes', 'starterBoxes'))
            except allowance.AllowanceError as error:
                errors['starter_boxes'] = [error.message]
        # The camel case parser may split `m2PerBox` before the digit, so every spelling is read.
        names = ('m2_per_box', 'm_2_per_box', 'm2PerBox')
        if any(n in data for n in names):
            raw = _first(data, *names)
            if raw in (None, ''):
                changes['m2_per_box'] = None
            else:
                try:
                    value = Decimal(str(raw)) if not isinstance(raw, bool) else None
                    if value is None or not value.is_finite() or value <= 0 or value > M2_PER_BOX_MAX or value != value.quantize(Decimal('0.01')):
                        raise InvalidOperation
                    changes['m2_per_box'] = value
                except InvalidOperation:
                    errors['m2_per_box'] = ['Please enter the space one box needs, in square metres, above 0 and up to 1000, with at most two decimals.']
        if errors:
            return api_error('Please check what you entered and try again.', 422, errors)
        for field, value in changes.items():
            setattr(row, field, value)
        row.save()
        log_action(request, 'UPDATE', 'SupplySettings', row.pk, f'Changed the egg supply settings of {coop.name}')
        return api_success(_settings_row(row), 'Settings saved.')

