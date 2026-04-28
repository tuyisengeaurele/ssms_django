from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from farms.models import Farm
from alerts.models import AlertLog, AlertType
from .models import Batch
from .serializers import (
    BatchListSerializer, BatchDetailSerializer,
    BatchCreateSerializer, BatchUpdateStageSerializer,
)
from core.utils import api_success, api_error


def _get_accessible_farm(farm_id, user):
    try:
        farm = Farm.objects.get(pk=farm_id, is_active=True)
    except Farm.DoesNotExist:
        return None, api_error('Farm not found.', 404)
    if user.role == 'FARMER' and farm.owner_id != user.id:
        return None, api_error('Farm not found.', 404)
    return farm, None


def _get_accessible_batch(batch_id, user):
    try:
        batch = Batch.objects.select_related('farm').get(pk=batch_id, is_active=True)
    except Batch.DoesNotExist:
        return None, api_error('Batch not found.', 404)
    if user.role == 'FARMER' and batch.farm.owner_id != user.id:
        return None, api_error('Batch not found.', 404)
    return batch, None


class BatchCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error('Forbidden. Insufficient permissions.', 403)
        serializer = BatchCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)

        farm_id = serializer.validated_data['farm_id']
        farm, err = _get_accessible_farm(farm_id, request.user)
        if err:
            return err

        batch = Batch.objects.create(
            farm=farm,
            expected_harvest_date=serializer.validated_data['expected_harvest_date'],
            notes=serializer.validated_data.get('notes'),
        )
        batch.refresh_from_db()
        return api_success(BatchListSerializer(batch).data, 'Batch created.', 201)


class BatchByFarmView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, farm_id):
        farm, err = _get_accessible_farm(farm_id, request.user)
        if err:
            return err
        batches = Batch.objects.filter(farm=farm, is_active=True).order_by('-created_at')
        return api_success(BatchListSerializer(batches, many=True).data)


class BatchDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        batch, err = _get_accessible_batch(pk, request.user)
        if err:
            return err
        full_batch = (
            Batch.objects
            .select_related('farm')
            .prefetch_related('disease_detections', 'sensor_readings', 'alert_logs')
            .get(pk=pk)
        )
        return api_success(BatchDetailSerializer(full_batch).data)

    def delete(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error('Forbidden. Insufficient permissions.', 403)
        batch, err = _get_accessible_batch(pk, request.user)
        if err:
            return err
        batch.is_active = False
        batch.save(update_fields=['is_active'])
        return api_success(None, 'Batch deleted.')


class BatchUpdateStageView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error('Forbidden. Insufficient permissions.', 403)
        batch, err = _get_accessible_batch(pk, request.user)
        if err:
            return err
        serializer = BatchUpdateStageSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)

        new_stage = serializer.validated_data['stage']
        with transaction.atomic():
            batch.stage = new_stage
            batch.save(update_fields=['stage'])
            AlertLog.objects.create(
                batch=batch,
                type=AlertType.STAGE_CHANGE,
                message=f'Batch stage updated to {new_stage}.',
            )
        batch.refresh_from_db()
        return api_success(BatchListSerializer(batch).data, 'Stage updated.')
