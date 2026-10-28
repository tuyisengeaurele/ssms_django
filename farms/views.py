from django.db.models import Prefetch
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from batches.models import Batch
from batches.queries import with_counts
from core.access import get_farm_or_404, scope_farms
from core.doc_format import clean_lang
from core.pagination import StandardPagination
from core.utils import api_error, api_success

from .models import Farm
from .serializers import FarmCreateSerializer, FarmDetailSerializer, FarmSerializer, FarmUpdateSerializer
from .summary import farm_summary_pdf


def _with_active_batches():
    """Prefetch each farm's active batches, with their totals, so listing farms costs a fixed number of queries."""
    return Prefetch(
        'batches',
        queryset=with_counts(Batch.objects.filter(is_active=True)),
        to_attr='active_batches',
    )


class FarmListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        farms = (
            scope_farms(request.user)
            .select_related('owner')
            .prefetch_related(_with_active_batches())
            .order_by('-created_at')
        )
        paginator = StandardPagination()
        page = paginator.paginate_queryset(farms, request)
        if page is not None:
            return paginator.get_paginated_response(FarmSerializer(page, many=True).data)
        return api_success(FarmSerializer(farms, many=True).data)

    def post(self, request):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        serializer = FarmCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        farm = Farm.objects.create(
            owner=request.user,
            **serializer.validated_data,
        )
        farm.refresh_from_db()
        log_action(request, 'CREATE', 'Farm', farm.pk, f'Created farm: {farm.name}')
        return api_success(FarmSerializer(farm).data, 'Farm created.', 201)


class FarmSummaryView(APIView):
    """GET /api/farms/<id>/summary?lang=en|fr|rw, the farm summary as a PDF on the SSMS letterhead.

    Anyone who may see the farm may ask for it. The name on the document is the person who asked.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        farm = get_farm_or_404(request.user, pk)
        pdf = farm_summary_pdf(farm, request.user.name or request.user.email, clean_lang(request.query_params.get('lang')))
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="farm_summary_{farm.pk[-8:].upper()}_{timezone.now():%Y-%m-%d}.pdf"'
        return response


class FarmDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        farm = get_farm_or_404(request.user, pk, Farm.objects.prefetch_related(_with_active_batches()))
        return api_success(FarmDetailSerializer(farm).data)

    def patch(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        farm = get_farm_or_404(request.user, pk)
        serializer = FarmUpdateSerializer(farm, data=request.data, partial=True)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        serializer.save()
        log_action(request, 'UPDATE', 'Farm', farm.pk, f'Updated farm: {farm.name}')
        return api_success(FarmSerializer(farm).data, 'Farm updated.')

    def delete(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        farm = get_farm_or_404(request.user, pk)
        farm.is_active = False
        farm.save(update_fields=['is_active'])
        log_action(request, 'DELETE', 'Farm', farm.pk, f'Deleted farm: {farm.name}')
        return api_success(None, 'Farm deleted.')
