"""Changing the login email: POST /api/auth/email-change (ask), GET (what is pending), DELETE (cancel), and the two public
links, /confirm and /undo. The rules are in `users/email_change.py`."""
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from core.mfa_guard import require_recent_mfa
from core.permissions import RolePermission
from core.sensitive import SensitiveRateThrottle, mask_email, require_password, require_typed, sensitive_error
from core.throttles import PasswordResetRateThrottle
from core.utils import api_error, api_success

from . import email_change
from .email_change import CONFIRM_FOR, EmailChangeError


class AskSerializer(serializers.Serializer):
    new_email = serializers.EmailField()
    # Checked by require_typed, so a missing or null value is a wrong answer and not a shape error.
    confirm_email = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    password = serializers.CharField(required=False, allow_blank=True, allow_null=True, trim_whitespace=False)


def _row(change) -> dict:
    return {'id': change.pk, 'new_email': mask_email(change.new_email), 'created_at': change.created_at, 'expires_at': change.created_at + CONFIRM_FOR}


def _refuse(err: EmailChangeError):
    if err.field:
        return sensitive_error(err.code, err.message, err.field)
    return api_error(err.message, err.status, code=err.code)


class EmailChangeView(APIView):
    """The signed in person asks to change their login email, looks at what is pending, or takes the request back."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'account_security'
    actions = {'get': 'email_change', 'post': 'email_change', 'delete': 'email_change'}

    def get_throttles(self):
        throttles = super().get_throttles()
        # Only asking spends the allowance. Looking at the page must not use up the five a minute that guard the password.
        if self.request.method == 'POST':
            throttles.append(SensitiveRateThrottle())
        return throttles

    def get(self, request):
        change = email_change.pending_for(request.user)
        return api_success(_row(change) if change else None)

    def post(self, request):
        if request.user.role == 'ADMIN':
            require_recent_mfa(request)
        serializer = AskSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors, code='invalid_input')
        data = serializer.validated_data
        try:
            require_typed(data.get('confirm_email'), request.user.email, field='confirm_email')
            require_password(request.user, data.get('password'))
        except DRFValidationError as exc:
            return api_error('Please check what you entered and try again.', 422, exc.detail, code='invalid_input')
        try:
            change = email_change.start(request.user, data['new_email'], request)
        except EmailChangeError as err:
            return _refuse(err)
        return api_success(_row(change), 'We sent a link to the new address.', 201)

    def delete(self, request):
        if not email_change.cancel(request.user):
            return api_error('There is nothing to cancel.', 404, code='nothing_to_cancel')
        return api_success(None, 'The request was cancelled.')


class _LinkView(APIView):
    """A link in an email. It is opened in a browser that may hold no sign in, so it asks for none: the signed token is the proof."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]


class EmailChangeConfirmView(_LinkView):
    def post(self, request):
        try:
            email_change.confirm(request.data.get('token'), request)
        except EmailChangeError as err:
            return api_error(err.message, err.status, code=err.code)
        return api_success(None, 'Your email address was changed. Please sign in with the new one.')


class EmailChangeUndoView(_LinkView):
    def post(self, request):
        try:
            email_change.undo(request.data.get('token'), request)
        except EmailChangeError as err:
            return api_error(err.message, err.status, code=err.code)
        return api_success(None, 'The change was undone. We sent a link to choose a new password.')
