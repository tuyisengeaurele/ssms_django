from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from django.db.models import Prefetch

from batches.models import Batch
from core.access import get_batch_or_404, scope_alerts
from core.pagination import StandardPagination
from core.params import int_param
from core.utils import api_error, api_success

from .models import AlertLog, StageThreshold
from .room_alerts import alerts_for_batch
from .serializers import AlertLogSerializer, StageThresholdSerializer
from .summary import with_comment_summary
from .tickets import TICKET_SECONDS, issue_ticket


def with_rooms(qs):
    """What the serializer needs to name an alert's room and batches without a query for each alert."""
    qs = qs.select_related('batch__farm__owner', 'room__farm__owner').prefetch_related(
        Prefetch('room__batches', queryset=Batch.objects.filter(is_active=True).order_by('created_at'), to_attr='live_batches'),
    )
    return with_comment_summary(qs)


class AlertListView(APIView):
    """
    GET /api/alerts
    Returns the alerts the caller may see, unread by default.
    Optional query params:
      ?unread=true  , only unread (default)
      ?limit=N      , cap results (default 100)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error("You don't have permission to do that.", 403)

        unread_only = request.query_params.get('unread', 'true').lower() != 'false'
        limit = int_param(request, 'limit', 100, 1, 500)

        qs = with_rooms(scope_alerts(request.user, AlertLog.objects.order_by('-created_at')))

        if unread_only:
            qs = qs.filter(is_read=False)

        # If no explicit page param, fall back to legacy limit-based slice for SSE/widget calls
        if 'page' in request.query_params:
            paginator = StandardPagination()
            page = paginator.paginate_queryset(qs, request)
            if page is not None:
                return paginator.get_paginated_response(AlertLogSerializer(page, many=True).data)

        alerts = qs[:limit]
        return api_success(AlertLogSerializer(alerts, many=True).data)


class AlertMarkAllReadView(APIView):
    """POST /api/alerts/mark-all-read, mark every unread alert the caller may see as read."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)

        qs = scope_alerts(request.user, AlertLog.objects.filter(is_read=False))

        updated = qs.update(is_read=True)
        return api_success({'updated': updated}, f'{updated} alert(s) marked as read.')


class AlertsByBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        batch = get_batch_or_404(request.user, batch_id)

        alerts = with_rooms(alerts_for_batch(batch)).order_by('-created_at')
        return api_success(AlertLogSerializer(alerts, many=True).data)


class AlertMarkReadView(APIView):
    permission_classes = [IsAuthenticated]
    # Marking unread is the undo of marking read, so both views share one rule for who may touch an alert.
    read = True

    def patch(self, request, pk):
        alert = with_rooms(scope_alerts(request.user, AlertLog.objects.all())).filter(pk=pk).first()
        if alert is None:
            return api_error("We couldn't find that alert.", 404)

        alert.is_read = self.read
        alert.save(update_fields=['is_read'])
        return api_success(AlertLogSerializer(alert).data, 'Alert marked as read.' if self.read else 'Alert marked as unread.')


class AlertMarkUnreadView(AlertMarkReadView):
    read = False


class AlertStreamTicketView(APIView):
    """POST /api/alerts/stream-ticket, a 30 second single-use ticket for the live alert stream."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        return api_success({'ticket': issue_ticket(request.user), 'expiresIn': TICKET_SECONDS})


STAGE_ORDER = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST']


class StageThresholdListView(APIView):
    """GET /api/alerts/thresholds, the safe range of every stage. Anyone signed in may read it."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = {t.stage: t for t in StageThreshold.objects.all()}
        ordered = [rows[stage] for stage in STAGE_ORDER if stage in rows]
        return api_success(StageThresholdSerializer(ordered, many=True).data)


class StageThresholdDetailView(APIView):
    """PUT /api/alerts/thresholds/<stage>, change the safe range of one stage. Admin only."""
    permission_classes = [IsAuthenticated]

    def put(self, request, stage):
        if request.user.role != 'ADMIN':
            return api_error("You don't have permission to do that.", 403)
        row = StageThreshold.objects.filter(stage=stage).first()
        if row is None:
            return api_error("We couldn't find that stage.", 404)
        serializer = StageThresholdSerializer(row, data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        serializer.save()
        log_action(
            request, 'UPDATE', 'Threshold', stage,
            f'Safe range for {stage}: {row.temp_min} to {row.temp_max} C, {row.hum_min} to {row.hum_max} %',
        )
        return api_success(StageThresholdSerializer(row).data, 'Safe range updated.')
