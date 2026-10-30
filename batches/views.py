from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from alerts.models import AlertLog, AlertType
from audit_log.utils import log_action
from core.access import get_batch_or_404, get_farm_or_404, scope_batches
from core.doc_format import clean_lang
from core.utils import api_error, api_success
from farms.models import RearingRoom

from .compare import BadChoice, compare_batches, parse_ids
from .models import Batch
from .placement import leave_room, place_batch
from .queries import with_counts
from .report import batch_report_pdf
from .serializers import (
    BatchCreateSerializer,
    BatchDetailSerializer,
    BatchListSerializer,
    BatchSupervisorSerializer,
    BatchUpdateSerializer,
    BatchUpdateStageSerializer,
)

CHOOSE_ROOM = 'Please choose a room.'
NOT_THIS_FARMS_ROOM = "Please choose one of this farm's rooms."


def _room_for_new_batch(farm, room_id):
    """The room a new batch goes in. (room, error response).

    A farm with no rooms gets "Room 1" made for it, a farm with one room uses it, and a farm with several needs a choice.
    """
    rooms = list(RearingRoom.objects.filter(farm=farm, is_active=True))
    if room_id:
        chosen = next((r for r in rooms if r.pk == room_id), None)
        if chosen is None:
            return None, api_error(NOT_THIS_FARMS_ROOM, 422, {'room_id': [NOT_THIS_FARMS_ROOM]})
        return chosen, None
    if not rooms:
        return RearingRoom.objects.create(farm=farm, name='Room 1'), None
    if len(rooms) == 1:
        return rooms[0], None
    return None, api_error(CHOOSE_ROOM, 422, {'room_id': [CHOOSE_ROOM]})


class BatchCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        serializer = BatchCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)

        farm = get_farm_or_404(request.user, serializer.validated_data['farm_id'])
        room, error = _room_for_new_batch(farm, serializer.validated_data.get('room_id'))
        if error:
            return error

        # The first batch the farmer has ever started, deleted ones included, so the page can say a quiet well done once.
        first = request.user.pk == farm.owner_id and not Batch.objects.filter(farm__owner_id=farm.owner_id).exists()
        batch = Batch.objects.create(
            farm=farm,
            expected_harvest_date=serializer.validated_data['expected_harvest_date'],
            notes=serializer.validated_data.get('notes'),
            breed=serializer.validated_data.get('breed', ''),
            quantity=serializer.validated_data.get('quantity'),
            quantity_unit=serializer.validated_data.get('quantity_unit', 'BOXES'),
        )
        place_batch(batch, room, when=batch.start_date)
        batch.refresh_from_db()
        log_action(request, 'CREATE', 'Batch', batch.pk, f'Created batch on farm {farm.name}')
        data = {**BatchListSerializer(batch).data, 'milestone': 'FIRST_BATCH' if first else None}
        return api_success(data, 'Batch created.', 201)


class BatchByFarmView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, farm_id):
        farm = get_farm_or_404(request.user, farm_id)
        batches = with_counts(Batch.objects.filter(farm=farm, is_active=True)).order_by('-created_at')
        return api_success(BatchListSerializer(batches, many=True).data)


class BatchReportView(APIView):
    """GET /api/batches/<id>/report?lang=en|fr|rw, the batch report as a PDF on the SSMS letterhead.

    Anyone who may see the batch may ask for it. The name on the document is the person who asked.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        batch = get_batch_or_404(request.user, pk, Batch.objects.select_related('room'))
        pdf = batch_report_pdf(batch, request.user.name or request.user.email, clean_lang(request.query_params.get('lang')))
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="batch_report_{batch.pk[-8:].upper()}_{timezone.now():%Y-%m-%d}.pdf"'
        return response


class BatchDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        batch = get_batch_or_404(
            request.user, pk,
            Batch.objects.select_related('room').prefetch_related('disease_detections', 'alert_logs'),
        )
        return api_success(BatchDetailSerializer(batch).data)

    def patch(self, request, pk):
        """PATCH /api/batches/<id>, correct the breed, quantity, unit or notes. The stage has its own route."""
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        batch = get_batch_or_404(request.user, pk)
        serializer = BatchUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        for field, value in serializer.validated_data.items():
            setattr(batch, field, value)
        batch.save(update_fields=list(serializer.validated_data) or None)
        log_action(request, 'UPDATE', 'Batch', batch.pk, f'Changed details of batch {batch.pk}')
        return api_success(BatchListSerializer(batch).data, 'Batch updated.')

    def delete(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        batch = get_batch_or_404(request.user, pk)
        batch.is_active = False
        batch.save(update_fields=['is_active'])
        leave_room(batch)
        log_action(request, 'DELETE', 'Batch', batch.pk, f'Deleted batch {batch.pk}')
        return api_success(None, 'Batch deleted.')


class BatchRoomView(APIView):
    """POST /api/batches/<id>/room, move a batch to another room of its farm. Where it has been is kept."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        batch = get_batch_or_404(request.user, pk, Batch.objects.select_related('room'))
        room = RearingRoom.objects.filter(pk=request.data.get('room_id') or '', farm=batch.farm, is_active=True).first()
        if room is None:
            return api_error(NOT_THIS_FARMS_ROOM, 422, {'room_id': [NOT_THIS_FARMS_ROOM]})
        if batch.room_id != room.pk:
            place_batch(batch, room)
            log_action(request, 'UPDATE', 'Batch', batch.pk, f'Moved batch {batch.pk} to {room.name}')
        return api_success(BatchListSerializer(batch).data, 'Batch moved.')


class BatchActiveSupervisorView(APIView):
    """
    GET /api/batches/active
    Each role sees the batches the access rules allow (see core.access).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error("You don't have permission to do that.", 403)
        from django.db.models import Count, OuterRef, Subquery

        from alerts.room_alerts import open_problem_count
        from sensors.models import SensorReading
        from sensors.room_readings import belongs_to_batch

        # Everything is worked out in the one query, so the list does not cost more as batches are added.
        newest = SensorReading.objects.filter(belongs_to_batch(OuterRef('pk'))).order_by('-timestamp')
        qs = scope_batches(
            request.user,
            Batch.objects.select_related('farm', 'room').annotate(
                detection_count=Count('disease_detections', distinct=True),
                open_alerts=open_problem_count(),
                latest_temperature=Subquery(newest.values('temperature')[:1]),
                latest_humidity=Subquery(newest.values('humidity')[:1]),
                latest_reading_at=Subquery(newest.values('timestamp')[:1]),
            ),
        ).order_by('-created_at')
        return api_success(BatchSupervisorSerializer(qs, many=True).data)


# Enforced one-way progression, a batch can only move forward, never backward.
STAGE_ORDER = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST']


class BatchUpdateStageView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        batch = get_batch_or_404(request.user, pk)
        serializer = BatchUpdateStageSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)

        new_stage = serializer.validated_data['stage']

        # Guard: reject backwards or same-stage moves
        current_idx = STAGE_ORDER.index(batch.stage)
        new_idx     = STAGE_ORDER.index(new_stage)
        if new_idx <= current_idx:
            return api_error(
                f'A batch can only move forward. It is at {batch.stage.title()} now, '
                f'so it cannot go back to {new_stage.title()}.',
                400,
            )

        with transaction.atomic():
            batch.stage = new_stage
            batch.save(update_fields=['stage'])
            AlertLog.objects.create(
                batch=batch,
                type=AlertType.STAGE_CHANGE,
                message=f'Batch stage updated to {new_stage}.',
            )
        batch.refresh_from_db()
        if new_stage == 'HARVEST' and batch.room_id:
            # A room judges only the batches still being reared, so this may have emptied it.
            from alerts.utils import settle_room_alerts
            settle_room_alerts(batch.room_id)
        log_action(request, 'UPDATE', 'Batch', batch.pk, f'Stage advanced to {new_stage}')
        return api_success(BatchListSerializer(batch).data, 'Stage updated.')


class BatchCompareView(APIView):
    """GET /api/batches/compare?ids=a,b,c, two to four batches side by side.

    Each role may compare the batches the access rules allow (see core.access). A batch that does not exist and one the
    person may not see get the same answer.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            ids = parse_ids(request.query_params.get('ids', ''))
        except BadChoice as error:
            return api_error(str(error), 422)
        return api_success({'batches': compare_batches(request.user, ids)})
