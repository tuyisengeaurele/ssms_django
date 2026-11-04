"""GET /api/admin/health: whether SSMS is working. Admin only. It reads and reports, and changes nothing."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.health import run_checks
from core.permissions import RolePermission
from core.utils import api_success


class SystemHealthView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'system_health'

    def get(self, request):
        return api_success(run_checks())
