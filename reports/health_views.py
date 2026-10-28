"""GET /api/admin/health: whether SSMS is working. Admin only. It reads and reports, and changes nothing."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.health import run_checks
from core.utils import api_error, api_success


class SystemHealthView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'ADMIN':
            return api_error("You don't have permission to do that.", 403)
        return api_success(run_checks())
