"""Closing an account: POST /api/auth/delete-account (ask) and POST /api/auth/delete-account/cancel (keep the account).

The rules are in `users/closure.py`. The cancel route is the one thing a scheduled account can still reach, besides its own
details and signing out (`core/account_gate.py`).
"""
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.permissions import RolePermission
from core.sensitive import SensitiveRateThrottle, require_password, require_typed
from core.utils import api_error, api_success

from . import closure
from .closure import ClosureError


class AskSerializer(serializers.Serializer):
    # Checked by require_typed, so a missing or null value is a wrong answer and not a shape error.
    confirm_email = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    password = serializers.CharField(required=False, allow_blank=True, allow_null=True, trim_whitespace=False)


def _answer(user):
    return {'deletion_date': closure.removal_date(user).date().isoformat()}


def _refuse(err: ClosureError):
    return api_error(err.message, err.status, code=err.code)


class DeleteAccountView(APIView):
    """A farmer asks to close their own account, with the typed email and the password."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'account_security'
    actions = {'post': 'delete'}
    throttle_classes = [SensitiveRateThrottle]

    def post(self, request):
        # Staff are told first, before anything about their email or password is asked.
        if request.user.role != 'FARMER':
            return _refuse(ClosureError(closure.NOT_FOR_STAFF, 403, 'deletion_not_for_staff'))
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
            user = closure.request_closure(request.user, request)
        except ClosureError as err:
            return _refuse(err)
        return api_success(_answer(user), 'Your account will be removed on the date shown.')


class CancelDeleteAccountView(APIView):
    """The farmer keeps the account."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'account_security'
    actions = {'post': 'delete'}

    def post(self, request):
        try:
            closure.cancel_closure(request.user, request)
        except ClosureError as err:
            return _refuse(err)
        return api_success(None, 'Your account is kept.')
