"""Supply rounds over HTTP, under /api/supply/rounds and /api/supply/requests.

A supervisor manages the rounds of their cooperative and an admin any. A farmer sees the round of their own cooperative and
only their own request. What is outside a person's reach is "not found". The rules themselves are in `supply/rounds.py`.
"""
from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from cooperatives.team_views import team_cooperative
from core.permissions import RolePermission
from core.utils import api_error, api_success
from farms.models import RearingRoom

from . import round_notify, rounds
from .limits import request_limit
from .models import EggRequest, SupplyRound
from .rounds import staff_rounds as _staff_rounds

Status = SupplyRound.Status
Req = EggRequest.Status
FACTS = ('name', 'stock_boxes', 'request_deadline', 'delivery_date', 'delivery_place', 'expected_harvest_date')


def _fail(error: rounds.RoundError):
    return api_error(error.message, error.status, code=error.code)


def _round_row(r: SupplyRound, **extra) -> dict:
    return {
        'id': r.pk, 'name': r.name, 'stock_boxes': r.stock_boxes, 'request_deadline': r.request_deadline, 'delivery_date': r.delivery_date,
        'delivery_place': r.delivery_place, 'expected_harvest_date': r.expected_harvest_date, 'lot_code': r.lot_code,
        # The status a person should read: an open round past its deadline is closed.
        'status': rounds.effective_status(r), 'paused': r.paused, 'created_at': r.created_at, 'allocated_at': r.allocated_at, **extra,
    }


def _request_row(q: EggRequest) -> dict:
    return {
        'id': q.pk, 'status': q.status, 'boxes_asked': q.boxes_asked, 'note': q.note, 'boxes_approved': q.boxes_approved,
        'decision_note': q.decision_note, 'boxes_received': q.boxes_received, 'condition': q.condition, 'received_at': q.received_at,
        'batch_id': q.batch_id, 'created_at': q.created_at,
        'farmer': {'id': q.farmer_id, 'name': q.farmer.name, 'email': q.farmer.email},
        'room': {'id': q.room_id, 'name': q.room.name}, 'farm': {'id': q.farm_id, 'name': q.farm.name},
    }


def _counts(qs):
    return qs.annotate(
        request_count=Count('requests', filter=~Q(requests__status=Req.CANCELLED)),
        approved_boxes=Sum('requests__boxes_approved', filter=Q(requests__status__in=[Req.APPROVED, Req.PART_APPROVED, Req.RECEIVED])),
    )


def _facts(data) -> dict:
    """The facts of a round from a request body. Anything that does not parse becomes None, and the rules refuse it by name."""
    facts = {}
    for key in FACTS:
        if key not in data:
            continue
        value = data[key]
        if key == 'request_deadline':
            parsed = parse_datetime(value) if isinstance(value, str) else None
            value = timezone.make_aware(parsed) if parsed is not None and timezone.is_naive(parsed) else parsed
        elif key in ('delivery_date', 'expected_harvest_date'):
            value = parse_date(value) if isinstance(value, str) else None
        facts[key] = value
    return facts


# ── the supervisor's side ─────────────────────────────────────────────────────

class RoundListView(APIView):
    """GET lists the rounds of the cooperative (an admin: all, or one with `cooperativeId`). POST makes a draft."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'get': 'read', 'post': 'create'}

    def get(self, request):
        if request.user.role == 'SUPERVISOR' and not request.user.cooperative_id:
            return api_error('You are not part of a cooperative yet.', 403)
        found = _counts(_staff_rounds(request.user, request.query_params.get('cooperativeId') or None))
        return api_success({'rounds': [_round_row(r, request_count=r.request_count, approved_boxes=r.approved_boxes or 0) for r in found]})

    def post(self, request):
        coop, err = team_cooperative(request)
        if err:
            return err
        try:
            made = rounds.create_round(coop, request.user, **_facts(request.data))
        except rounds.RoundError as error:
            return _fail(error)
        log_action(request, 'CREATE', 'SupplyRound', made.pk, f'Made the supply round {made.name} for {coop.name} ({made.stock_boxes} boxes)')
        return api_success(_round_row(made), 'Round made.', 201)


class RoundDetailView(APIView):
    """GET a round with its requests. PATCH changes the facts of a draft or open round."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'get': 'read', 'patch': 'update'}

    def get(self, request, pk):
        found = _staff_rounds(request.user).filter(pk=pk).first()
        if found is None:
            return api_error('We could not find that round.', 404)
        asked = found.requests.select_related('farmer', 'room', 'farm').order_by('created_at')
        return api_success({'round': _round_row(found), 'requests': [_request_row(q) for q in asked]})

    def patch(self, request, pk):
        found = _staff_rounds(request.user).filter(pk=pk).first()
        if found is None:
            return api_error('We could not find that round.', 404)
        try:
            changed = rounds.edit_round(found, **_facts(request.data))
        except rounds.RoundError as error:
            return _fail(error)
        log_action(request, 'UPDATE', 'SupplyRound', changed.pk, f'Changed the supply round {changed.name}')
        return api_success(_round_row(changed), 'Round changed.')


class RoundActionView(APIView):
    """POST {action: open | close | cancel | pause | resume, note}. Cancelling needs a note the farmers read."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'post': 'action'}

    def post(self, request, pk):
        found = _staff_rounds(request.user).filter(pk=pk).first()
        if found is None:
            return api_error('We could not find that round.', 404)
        name = request.data.get('action')
        affected = []
        try:
            if name == 'open':
                done, detail = rounds.open_round(found, request.user), f'Opened the supply round {found.name} (lot {found.lot_code})'
            elif name == 'close':
                done, detail = rounds.close_round(found), f'Closed the requests of {found.name}'
            elif name == 'cancel':
                note = request.data.get('note') or ''
                done, detail = None, f'Cancelled the supply round {found.name}: {str(note).strip()}'
                affected = rounds.cancel_round(found, request.user, note)
                done = SupplyRound.objects.get(pk=found.pk)
            elif name in ('pause', 'resume'):
                done, detail = rounds.set_paused(found, name == 'pause'), f'{"Paused" if name == "pause" else "Resumed"} the supply round {found.name}'
            else:
                return api_error('Please open, close, cancel, pause or resume.', 400, code='bad_action')
        except rounds.RoundError as error:
            return _fail(error)
        log_action(request, 'UPDATE', 'SupplyRound', found.pk, detail)
        if name == 'open':
            round_notify.tell_farmers_round_open(done)
        elif name == 'cancel':
            round_notify.tell_cancelled(done, affected, str(request.data.get('note') or '').strip())
        return api_success(_round_row(done), 'Done.')


class RoundProposalView(APIView):
    """GET the split the system proposes for a closed round."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'get': 'proposal'}

    def get(self, request, pk):
        found = _staff_rounds(request.user).filter(pk=pk).first()
        if found is None:
            return api_error('We could not find that round.', 404)
        try:
            rows = rounds.proposal(found)
        except rounds.RoundError as error:
            return _fail(error)
        return api_success({'requests': rows, 'stock': found.stock_boxes, 'total': sum(r['proposed'] for r in rows)})


class RoundConfirmView(APIView):
    """POST {items: [{id, boxes, declineNote}]} confirms the split. Every request that waits must be in it."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'post': 'confirm'}

    def post(self, request, pk):
        found = _staff_rounds(request.user).filter(pk=pk).first()
        if found is None:
            return api_error('We could not find that round.', 404)
        items = request.data.get('items')
        if not isinstance(items, list) or not all(isinstance(i, dict) for i in items):
            return api_error('Please send the split as a list.', 422, code='incomplete')
        try:
            done = rounds.confirm(found, request.user, items)
        except rounds.RoundError as error:
            return _fail(error)
        decided = list(done.requests.exclude(status__in=[Req.CANCELLED]).select_related('farmer', 'decided_by'))
        total = sum(q.boxes_approved or 0 for q in decided)
        log_action(request, 'UPDATE', 'SupplyRound', done.pk, f'Confirmed the split of {done.name}: {total} of {done.stock_boxes} boxes for {len(decided)} requests')
        for q in decided:
            round_notify.tell_decision(q, done)
        return api_success({'round': _round_row(done), 'total': total}, 'Split confirmed.')


class NotCollectedView(APIView):
    """POST marks promised eggs as not collected."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'post': 'not_collected'}

    def post(self, request, pk):
        scope = _staff_rounds(request.user)
        found = EggRequest.objects.select_related('farmer', 'round').filter(pk=pk, round__in=scope).first()
        if found is None:
            return api_error('We could not find that request.', 404)
        try:
            done = rounds.mark_not_collected(found, request.user)
        except rounds.RoundError as error:
            return _fail(error)
        log_action(request, 'UPDATE', 'EggRequest', done.pk, f'Marked the eggs of {found.farmer.name} as not collected')
        return api_success({'id': done.pk, 'status': done.status}, 'Marked.')


# ── the farmer's side ─────────────────────────────────────────────────────────

class CurrentRoundView(APIView):
    """GET the round the farmer should see: the one they have a request in, else the newest open one of their cooperative."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'get': 'read_current'}

    def get(self, request):
        farmer = request.user
        if not farmer.cooperative_id:
            return api_success({'round': None, 'my_request': None, 'rooms': []})
        live = [Status.OPEN, Status.CLOSED, Status.ALLOCATED]
        mine = (
            EggRequest.objects.filter(farmer=farmer, round__cooperative_id=farmer.cooperative_id, round__status__in=live)
            .exclude(status=Req.CANCELLED).select_related('farmer', 'room', 'farm', 'round').order_by('-created_at').first()
        )
        current = mine.round if mine else SupplyRound.objects.filter(cooperative_id=farmer.cooperative_id, status=Status.OPEN).order_by('-created_at').first()
        if current is None:
            return api_success({'round': None, 'my_request': None, 'rooms': []})
        rooms = []
        if rounds.effective_status(current) == Status.OPEN and mine is None:
            approved = RearingRoom.objects.filter(
                farm__owner=farmer, farm__is_active=True, is_active=True, approval_status=RearingRoom.Approval.APPROVED,
            ).select_related('farm').order_by('created_at')
            rooms = [{'id': r.pk, 'name': r.name, 'farm_name': r.farm.name, **request_limit(farmer, r, current)} for r in approved]
        return api_success({'round': _round_row(current), 'my_request': _request_row(mine) if mine else None, 'rooms': rooms})


class RoundRequestView(APIView):
    """POST {roomId, boxes, note} asks for eggs in a round."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'post': 'request'}

    def post(self, request, pk):
        farmer = request.user
        found = SupplyRound.objects.filter(pk=pk, cooperative_id=farmer.cooperative_id).exclude(status=Status.DRAFT).first() if farmer.cooperative_id else None
        if found is None:
            return api_error('We could not find that round.', 404)
        data = request.data
        room = RearingRoom.objects.select_related('farm').filter(pk=data.get('room_id') or '', farm__owner=farmer).first()
        if room is None:
            return api_error('We could not find that room.', 404, code='room_not_found')
        try:
            made = rounds.submit_request(farmer, found, room, data.get('boxes'), data.get('note') or '')
        except rounds.RoundError as error:
            return _fail(error)
        log_action(request, 'CREATE', 'EggRequest', made.pk, f'Asked for {made.boxes_asked} boxes in {found.name} for {room.name}')
        return api_success({'id': made.pk, 'boxes_asked': made.boxes_asked, 'status': made.status}, 'Request sent.', 201)


class EggRequestDetailView(APIView):
    """DELETE cancels the farmer's own request, before or after it was decided, until the eggs are received."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'delete': 'cancel'}

    def delete(self, request, pk):
        found = EggRequest.objects.select_related('round').filter(pk=pk, farmer=request.user).first()
        if found is None:
            return api_error('We could not find that request.', 404)
        try:
            rounds.cancel_request(found, request.user)
        except rounds.RoundError as error:
            return _fail(error)
        log_action(request, 'UPDATE', 'EggRequest', found.pk, f'Cancelled the request for {found.boxes_asked} boxes in {found.round.name}')
        return api_success(None, 'Request cancelled.')


class EggRequestReceiptView(APIView):
    """POST {boxes, condition} records that the eggs arrived. The farmer, or a supervisor or admin for them."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rounds'
    actions = {'post': 'receive'}

    def post(self, request, pk):
        user = request.user
        found = EggRequest.objects.select_related('farmer', 'round', 'room', 'farm').filter(pk=pk)
        if user.role == 'FARMER':
            found = found.filter(farmer=user)
        else:
            found = found.filter(round__in=_staff_rounds(user))
        found = found.first()
        if found is None:
            return api_error('We could not find that request.', 404)
        try:
            batch = rounds.receive(found, user, request.data.get('boxes'), request.data.get('condition') or '')
        except rounds.RoundError as error:
            return _fail(error)
        found.refresh_from_db()
        who = '' if user.pk == found.farmer_id else f' for {found.farmer.name}'
        log_action(request, 'UPDATE', 'EggRequest', found.pk, f'Received {found.boxes_received} boxes of lot {found.round.lot_code}{who} ({found.condition})')
        if user.pk != found.farmer_id:
            round_notify.tell_received_for(found, user)
        return api_success({'id': found.pk, 'status': found.status, 'boxes_received': found.boxes_received, 'batch_id': batch.pk}, 'Eggs received.', 201)
