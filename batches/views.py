from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from alerts.models import AlertLog, AlertType
from audit_log.utils import log_action
from core.access import get_batch_or_404, get_farm_or_404, scope_batches
from core.utils import api_error, api_success

from .models import Batch
from .queries import with_counts
from .serializers import (
    BatchCreateSerializer,
    BatchDetailSerializer,
    BatchListSerializer,
    BatchSupervisorSerializer,
    BatchUpdateSerializer,
    BatchUpdateStageSerializer,
)


class BatchCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        serializer = BatchCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)

        farm = get_farm_or_404(request.user, serializer.validated_data['farm_id'])

        batch = Batch.objects.create(
            farm=farm,
            expected_harvest_date=serializer.validated_data['expected_harvest_date'],
            notes=serializer.validated_data.get('notes'),
            breed=serializer.validated_data.get('breed', ''),
            quantity=serializer.validated_data.get('quantity'),
            quantity_unit=serializer.validated_data.get('quantity_unit', 'BOXES'),
        )
        batch.refresh_from_db()
        log_action(request, 'CREATE', 'Batch', batch.pk, f'Created batch on farm {farm.name}')
        return api_success(BatchListSerializer(batch).data, 'Batch created.', 201)


class BatchByFarmView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, farm_id):
        farm = get_farm_or_404(request.user, farm_id)
        batches = with_counts(Batch.objects.filter(farm=farm, is_active=True)).order_by('-created_at')
        return api_success(BatchListSerializer(batches, many=True).data)


class BatchDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        batch = get_batch_or_404(
            request.user, pk,
            Batch.objects.prefetch_related('disease_detections', 'sensor_readings', 'alert_logs'),
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
        log_action(request, 'DELETE', 'Batch', batch.pk, f'Deleted batch {batch.pk}')
        return api_success(None, 'Batch deleted.')


class BatchActiveSupervisorView(APIView):
    """
    GET /api/batches/active
    Each role sees the batches the access rules allow (see core.access).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error("You don't have permission to do that.", 403)
        from django.db.models import Count, OuterRef, Q, Subquery

        from sensors.models import SensorReading

        # Everything is worked out in the one query, so the list does not cost more as batches are added.
        newest = SensorReading.objects.filter(batch=OuterRef('pk')).order_by('-timestamp')
        qs = scope_batches(
            request.user,
            Batch.objects.select_related('farm').annotate(
                detection_count=Count('disease_detections', distinct=True),
                open_alerts=Count(
                    'alert_logs',
                    filter=Q(alert_logs__type__in=['TEMPERATURE', 'HUMIDITY'], alert_logs__resolved_at__isnull=True),
                    distinct=True,
                ),
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
        log_action(request, 'UPDATE', 'Batch', batch.pk, f'Stage advanced to {new_stage}')
        return api_success(BatchListSerializer(batch).data, 'Stage updated.')
