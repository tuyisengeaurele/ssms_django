from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from .models import Farm
from .serializers import FarmSerializer, FarmDetailSerializer, FarmCreateSerializer, FarmUpdateSerializer
from core.utils import api_success, api_error


def _farm_queryset(user):
    if user.role == 'FARMER':
        return Farm.objects.filter(owner=user, is_active=True)
    return Farm.objects.filter(is_active=True)


def _get_farm_or_403(pk, user):
    """Return (farm, error_response). Farmers can only access their own farms."""
    try:
        farm = Farm.objects.get(pk=pk)
    except Farm.DoesNotExist:
        return None, api_error('Farm not found.', 404)
    if not farm.is_active:
        return None, api_error('Farm not found.', 404)
    if user.role == 'FARMER' and farm.owner_id != user.id:
        return None, api_error('Farm not found.', 404)
    return farm, None


class FarmListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        farms = _farm_queryset(request.user).select_related('owner').order_by('-created_at')
        return api_success(FarmSerializer(farms, many=True).data)

    def post(self, request):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error('Forbidden. Insufficient permissions.', 403)
        serializer = FarmCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)
        farm = Farm.objects.create(
            owner=request.user,
            **serializer.validated_data,
        )
        farm.refresh_from_db()
        return api_success(FarmSerializer(farm).data, 'Farm created.', 201)


class FarmDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        farm, err = _get_farm_or_403(pk, request.user)
        if err:
            return err
        farm_with_related = Farm.objects.select_related('owner').prefetch_related(
            'batches'
        ).get(pk=pk)
        return api_success(FarmDetailSerializer(farm_with_related).data)

    def patch(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error('Forbidden. Insufficient permissions.', 403)
        farm, err = _get_farm_or_403(pk, request.user)
        if err:
            return err
        serializer = FarmUpdateSerializer(farm, data=request.data, partial=True)
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)
        serializer.save()
        return api_success(FarmSerializer(farm).data, 'Farm updated.')

    def delete(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error('Forbidden. Insufficient permissions.', 403)
        farm, err = _get_farm_or_403(pk, request.user)
        if err:
            return err
        farm.is_active = False
        farm.save(update_fields=['is_active'])
        return api_success(None, 'Farm deleted.')
