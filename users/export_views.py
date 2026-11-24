"""Download my data: POST /api/auth/export with the password. The password is in the body, never in an address, and the
file is built from the person's own records (`users/export.py`)."""
import json

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.permissions import RolePermission
from core.sensitive import require_password
from core.throttles import AccountExportThrottle
from core.utils import api_error
from logs.security import record_security_event

from .export import build_export


class AskSerializer(serializers.Serializer):
    # Checked by require_password, so a missing or null value is a wrong answer and not a shape error.
    password = serializers.CharField(required=False, allow_blank=True, allow_null=True, trim_whitespace=False)


class ExportView(APIView):
    """A person asks for everything SSMS holds about them, and gets one JSON file."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'account_security'
    actions = {'post': 'export'}
    throttle_classes = [AccountExportThrottle]

    def post(self, request):
        serializer = AskSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors, code='invalid_input')
        try:
            require_password(request.user, serializer.validated_data.get('password'))
        except DRFValidationError as exc:
            return api_error('Please check what you entered and try again.', 422, exc.detail, code='invalid_input')
        body = json.dumps(build_export(request.user), indent=2, ensure_ascii=False, default=str)
        # What was downloaded is not written down, only that it was.
        record_security_event('data_exported', request, detail='Downloaded as a file')
        response = HttpResponse(body, content_type='application/json; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="ssms-my-data-{timezone.now().date().isoformat()}.json"'
        response['Cache-Control'] = 'no-store'
        return response
