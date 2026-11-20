"""The signed in person's own notification choices. Nobody reads or changes another person's."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.changes import build_changes
from audit_log.utils import log_action
from core.permissions import RolePermission
from core.utils import api_error, api_success

from .notification_preferences import NotificationPreferencesSerializer, preferences_for, save_preferences


class NotificationPreferencesView(APIView):
    """GET gives the choices, PATCH changes some of them. A person who never chose has the defaults."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'account'

    def get(self, request):
        return api_success(preferences_for(request.user))

    def patch(self, request):
        before = preferences_for(request.user)
        serializer = NotificationPreferencesSerializer(data=request.data, partial=True, context={'current': before})
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        after = save_preferences(request.user, serializer.validated_data)
        log_action(
            request, 'UPDATE', 'NotificationPreference', request.user.pk, 'Changed notification preferences',
            changes=build_changes(before, after),
        )
        return api_success(after, 'Your choices are saved.')
