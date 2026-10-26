"""
Password reset flow:
  POST /api/auth/password-reset/request   { email }
      → emails a reset link if the account exists. The answer is the same either way.
  POST /api/auth/password-reset/confirm   { uid, token, newPassword }
      → checks the link, applies the password rules and sets the new password
"""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from core.throttles import PasswordResetRateThrottle
from core.tokens import revoke_all_refresh_tokens
from core.utils import api_error, api_success, body_field
from core.validators import validate_new_password

User = get_user_model()
logger = logging.getLogger(__name__)

SENT = 'If that email is registered, a reset link has been sent.'
BAD_LINK = "This reset link has expired or isn't valid. Please request a new one."


def _send_reset_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    reset_url = f'{frontend_url}/reset-password?uid={uid}&token={token}'

    send_mail(
        subject='Reset your SSMS password',
        message=(
            f'Hi {user.name},\n\n'
            f'We received a request to reset your password for your SSMS account.\n\n'
            f'Click the link below to set a new password (valid for 1 hour):\n'
            f'{reset_url}\n\n'
            f'If you did not request a password reset, you can safely ignore this email.\n\n'
            f', The SSMS Team'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


class PasswordResetRequestView(APIView):
    # A leftover token in the browser must not block a public page.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        email = str(request.data.get('email', '')).strip().lower()
        if not email:
            return api_error('Please enter your email address.', 422)

        # The answer never depends on whether the account exists or the mail went out,
        # so this page cannot be used to find out who has an account.
        user = User.objects.filter(email=email, is_active=True).first()
        if user is not None:
            try:
                _send_reset_email(user)
            except Exception:
                logger.exception('Could not send the password reset email to %s', user.email)
        return api_success(None, SENT)


class PasswordResetConfirmView(APIView):
    # A leftover token in the browser must not block a public page.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        uid_b64      = request.data.get('uid', '')
        token        = request.data.get('token', '')
        new_password = body_field(request.data, 'new_password', 'newPassword')

        if not all([uid_b64, token, new_password]):
            return api_error('This reset link is incomplete. Please request a new one.', 422)

        try:
            uid = force_str(urlsafe_base64_decode(uid_b64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return api_error(BAD_LINK, 400)

        if not user.is_active:
            return api_error('This account has been deleted. Please contact the SSMS team.', 400)

        if not default_token_generator.check_token(user, token):
            return api_error(BAD_LINK, 400)

        # The link is good. Now the password has to follow the rules, and a weak one leaves the link usable.
        try:
            validate_new_password(new_password, user)
        except ValidationError as exc:
            return api_error(str(exc.detail[0]), 422, {'new_password': exc.detail})

        user.set_password(new_password)
        user.save(update_fields=['password'])
        revoke_all_refresh_tokens(user)

        return api_success(None, 'Password reset successfully. You can now log in.')
