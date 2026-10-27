import io

from django.db.models import Avg, Count, Q, Sum
from django.http import StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.access import get_batch_or_404, scope_by_batch
from core.csvsafe import safe_writer
from core.pagination import StandardPagination
from core.utils import api_error, api_success

from .models import HarvestRecord
from .serializers import HarvestRecordCreateSerializer, HarvestRecordSerializer

# A harvest is recorded once the cocoons are made. Before that there is nothing to weigh.
HARVEST_STAGES = ('COCOON', 'HARVEST')
TOO_EARLY = 'A harvest can be recorded once the batch has reached the cocoon stage.'


class HarvestAllView(APIView):
    """
    GET /api/harvest               , JSON list (role-scoped), newest first
    GET /api/harvest?page=N       , the same a page at a time (?page_size=N, ?search=text)
    GET /api/harvest?export=csv   , streaming CSV download
    """
    permission_classes = [IsAuthenticated]

    def _scoped_qs(self, user):
        return scope_by_batch(
            user, HarvestRecord.objects.live().select_related('batch__farm').order_by('-harvested_at'),
        )

    def get(self, request):
        qs = self._scoped_qs(request.user)

        if request.query_params.get('export') == 'csv':
            def _rows(queryset):
                yield ['ID', 'Farm', 'Batch ID', 'Cocoon Weight (kg)', 'Silk Yield (g)', 'Quality Grade', 'Notes', 'Harvested At']
                for r in queryset:
                    yield [
                        r.id,
                        r.batch.farm.name if r.batch and r.batch.farm else '',
                        r.batch_id,
                        r.cocoon_weight_kg,
                        r.silk_yield_g or '',
                        r.quality_grade,
                        r.notes or '',
                        r.harvested_at.strftime('%Y-%m-%d %H:%M:%S'),
                    ]

            def _stream():
                buf = io.StringIO()
                writer = safe_writer(buf)
                for row in _rows(qs):
                    writer.writerow(row)
                    yield buf.getvalue()
                    buf.seek(0)
                    buf.truncate(0)

            response = StreamingHttpResponse(_stream(), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="harvest_records.csv"'
            return response

        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(batch__farm__name__icontains=search) | Q(quality_grade__icontains=search) | Q(notes__icontains=search),
            )

        if 'page' in request.query_params:
            paginator = StandardPagination()
            page = paginator.paginate_queryset(qs, request)
            if page is not None:
                return paginator.get_paginated_response(HarvestRecordSerializer(page, many=True).data)

        return api_success(HarvestRecordSerializer(qs, many=True).data)


class HarvestListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        get_batch_or_404(request.user, batch_id)
        records = HarvestRecord.objects.live().select_related('batch__farm').filter(batch_id=batch_id)
        return api_success(HarvestRecordSerializer(records, many=True).data)

    def post(self, request, batch_id):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to record a harvest.", 403)
        batch = get_batch_or_404(request.user, batch_id)
        if batch.stage not in HARVEST_STAGES:
            return api_error(TOO_EARLY, 422, {'batch_id': [TOO_EARLY]})

        data = {**request.data, 'batch_id': batch_id}
        serializer = HarvestRecordCreateSerializer(data=data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)

        vd = serializer.validated_data
        # The first harvest the farmer has ever recorded, deleted ones included.
        first = request.user.pk == batch.farm.owner_id and not HarvestRecord.objects.filter(batch__farm__owner_id=batch.farm.owner_id).exists()
        record = HarvestRecord.objects.create(
            batch_id=batch_id,
            cocoon_weight_kg=vd['cocoon_weight_kg'],
            silk_yield_g=vd.get('silk_yield_g'),
            quality_grade=vd['quality_grade'],
            notes=vd.get('notes') or None,
        )
        # Re-fetch with select_related so farm_name / farm_id resolve without extra queries
        record = HarvestRecord.objects.select_related('batch__farm').get(pk=record.pk)
        log_action(request, 'CREATE', 'HarvestRecord', record.pk, f'Logged harvest {record.cocoon_weight_kg} kg for batch {batch_id}')
        data = {**HarvestRecordSerializer(record).data, 'milestone': 'FIRST_HARVEST' if first else None}
        return api_success(data, 'Harvest record saved.', 201)


class HarvestStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = scope_by_batch(request.user, HarvestRecord.objects.live())

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
        by_farm = list(
            qs.values('batch__farm__name')
            .annotate(count=Count('id'), total_kg=Sum('cocoon_weight_kg'))
            .order_by('-total_kg', 'batch__farm__name')[:8]
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
            'by_farm': [
                {'farm': r['batch__farm__name'], 'count': r['count'], 'total_kg': float(r['total_kg'] or 0)}
                for r in by_farm
            ],
        })


class HarvestDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        record = scope_by_batch(
            request.user, HarvestRecord.objects.live().select_related('batch__farm'),
        ).filter(pk=pk).first()
        if record is None:
            return api_error("We couldn't find that record.", 404)
        record.is_active = False
        record.save(update_fields=['is_active'])
        log_action(request, 'DELETE', 'HarvestRecord', pk, f'Deleted harvest record {pk}')
        return api_success(None, 'Harvest record deleted.')
