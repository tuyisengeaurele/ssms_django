from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Avg, Count
from batches.models import Batch
from core.utils import api_success, api_error
from .models import HarvestRecord
from .serializers import HarvestRecordSerializer, HarvestRecordCreateSerializer


class HarvestAllView(APIView):
    """
    GET /api/harvest
    Returns all harvest records visible to the current user (role-scoped).
    FARMER → own batches only.  SUPERVISOR → cooperative.  ADMIN → all.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = HarvestRecord.objects.select_related('batch__farm').order_by('-harvested_at')
        if request.user.role == 'FARMER':
            qs = qs.filter(batch__farm__owner=request.user)
        elif request.user.role == 'SUPERVISOR':
            if request.user.cooperative_id:
                qs = qs.filter(
                    batch__farm__owner__cooperative_id=request.user.cooperative_id,
                    batch__farm__owner__role='FARMER',
                )
            else:
                qs = qs.none()
        # ADMIN: no filter
        return api_success(HarvestRecordSerializer(qs, many=True).data)


def _can_access_batch(batch, user):
    if user.role == 'ADMIN':
        return True
    if user.role == 'FARMER':
        return batch.farm.owner_id == user.id
    if user.role == 'SUPERVISOR':
        return (
            user.cooperative_id and
            batch.farm.owner.cooperative_id == user.cooperative_id and
            batch.farm.owner.role == 'FARMER'
        )
    return False


class HarvestListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        try:
            batch = Batch.objects.select_related('farm__owner').get(pk=batch_id, is_active=True)
        except Batch.DoesNotExist:
            return api_error('Batch not found.', 404)
        if not _can_access_batch(batch, request.user):
            return api_error('Batch not found.', 404)
        records = HarvestRecord.objects.select_related('batch__farm').filter(batch_id=batch_id)
        return api_success(HarvestRecordSerializer(records, many=True).data)

    def post(self, request, batch_id):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error('Only farmers and admins can log harvest records.', 403)
        try:
            batch = Batch.objects.select_related('farm__owner').get(pk=batch_id, is_active=True)
        except Batch.DoesNotExist:
            return api_error('Batch not found.', 404)
        if not _can_access_batch(batch, request.user):
            return api_error('Batch not found.', 404)

        data = {**request.data, 'batch_id': batch_id}
        serializer = HarvestRecordCreateSerializer(data=data)
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)

        vd = serializer.validated_data
        record = HarvestRecord.objects.create(
            batch_id=batch_id,
            cocoon_weight_kg=vd['cocoon_weight_kg'],
            silk_yield_g=vd.get('silk_yield_g'),
            quality_grade=vd['quality_grade'],
            notes=vd.get('notes') or None,
        )
        # Re-fetch with select_related so farm_name / farm_id resolve without extra queries
        record = HarvestRecord.objects.select_related('batch__farm').get(pk=record.pk)
        return api_success(HarvestRecordSerializer(record).data, 'Harvest record saved.', 201)


class HarvestStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = HarvestRecord.objects.all()
        if request.user.role == 'FARMER':
            qs = qs.filter(batch__farm__owner=request.user)
        elif request.user.role == 'SUPERVISOR':
            if request.user.cooperative_id:
                qs = qs.filter(
                    batch__farm__owner__cooperative_id=request.user.cooperative_id,
                    batch__farm__owner__role='FARMER',
                )
            else:
                qs = qs.none()

        agg = qs.aggregate(
            total_weight=Sum('cocoon_weight_kg'),
            total_silk=Sum('silk_yield_g'),
            avg_weight=Avg('cocoon_weight_kg'),
            count=Count('id'),
        )
        by_grade = list(
            qs.values('quality_grade')
            .annotate(count=Count('id'), total_kg=Sum('cocoon_weight_kg'))
            .order_by('quality_grade')
        )
        return api_success({
            'total_weight_kg': float(agg['total_weight'] or 0),
            'total_silk_g':    float(agg['total_silk']   or 0),
            'avg_weight_kg':   round(float(agg['avg_weight'] or 0), 2),
            'record_count':    agg['count'] or 0,
            'by_grade': [
                {'grade': r['quality_grade'], 'count': r['count'], 'total_kg': float(r['total_kg'] or 0)}
                for r in by_grade
            ],
        })


class HarvestDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error('Forbidden.', 403)
        try:
            record = HarvestRecord.objects.select_related('batch__farm').get(pk=pk)
        except HarvestRecord.DoesNotExist:
            return api_error('Record not found.', 404)
        if request.user.role == 'FARMER' and record.batch.farm.owner_id != request.user.id:
            return api_error('Record not found.', 404)
        record.delete()
        return api_success(None, 'Harvest record deleted.')
