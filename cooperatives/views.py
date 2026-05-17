"""Cooperative management views — /api/cooperatives."""

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .models import Cooperative
from .serializers import CooperativeSerializer, CooperativeDetailSerializer, CooperativeWriteSerializer
from core.utils import api_success, api_error


def _require_admin(user):
    if user.role != 'ADMIN':
        return api_error('Forbidden. Admin only.', 403)
    return None


class CooperativeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """GET /api/cooperatives — admin sees all, others see only their own."""
        if request.user.role == 'ADMIN':
            coops = Cooperative.objects.filter(is_active=True)
        elif request.user.cooperative_id:
            coops = Cooperative.objects.filter(id=request.user.cooperative_id, is_active=True)
        else:
            coops = Cooperative.objects.none()
        return api_success(CooperativeSerializer(coops, many=True).data)

    def post(self, request):
        """POST /api/cooperatives — create a cooperative (admin only)."""
        err = _require_admin(request.user)
        if err:
            return err
        serializer = CooperativeWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)
        coop = serializer.save()
        return api_success(CooperativeSerializer(coop).data, 'Cooperative created.', 201)


class CooperativeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_coop(self, pk, user):
        try:
            coop = Cooperative.objects.get(pk=pk, is_active=True)
        except Cooperative.DoesNotExist:
            return None, api_error('Cooperative not found.', 404)
        # Non-admin users can only access their own cooperative
        if user.role != 'ADMIN' and user.cooperative_id != coop.id:
            return None, api_error('Cooperative not found.', 404)
        return coop, None

    def get(self, request, pk):
        """GET /api/cooperatives/<id> — detail view with members and farms."""
        coop, err = self._get_coop(pk, request.user)
        if err:
            return err
        return api_success(CooperativeDetailSerializer(coop).data)

    def patch(self, request, pk):
        """PATCH /api/cooperatives/<id> — update (admin only)."""
        err = _require_admin(request.user)
        if err:
            return err
        coop, err = self._get_coop(pk, request.user)
        if err:
            return err
        serializer = CooperativeWriteSerializer(coop, data=request.data, partial=True)
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)
        serializer.save()
        return api_success(CooperativeSerializer(coop).data, 'Cooperative updated.')

    def delete(self, request, pk):
        """DELETE /api/cooperatives/<id> — deactivate (admin only)."""
        err = _require_admin(request.user)
        if err:
            return err
        coop, err = self._get_coop(pk, request.user)
        if err:
            return err
        coop.is_active = False
        coop.save(update_fields=['is_active'])
        return api_success(None, 'Cooperative deactivated.')
