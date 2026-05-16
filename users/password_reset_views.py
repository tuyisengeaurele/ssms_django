"""
Password reset flow:
  POST /api/auth/password-reset/request   { email }
      → generates a secure token, emails a reset link, always returns 200
  POST /api/auth/password-reset/confirm   { token, newPassword }
      → validates the token and sets the new password
"""
import re
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from core.utils import api_success, api_error
from core.throttles import PasswordResetRateThrottle

User = get_user_model()


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return api_error('Email is required.', 422)

        # Always respond with 200 to avoid user enumeration
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return api_success(None, 'If that email is registered, a reset link has been sent.')

        if not user.is_active:
            return api_success(None, 'If that email is registered, a reset link has been sent.')

        # Build the reset link
        uid   = urlsafe_base64_encode(force_bytes(user.pk))
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
                f'— The SSMS Team'
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        return api_success(None, 'If that email is registered, a reset link has been sent.')


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        uid_b64      = request.data.get('uid', '')
        token        = request.data.get('token', '')
        new_password = request.data.get('newPassword', '')

        if not all([uid_b64, token, new_password]):
            return api_error('uid, token, and newPassword are required.', 422)

        # Validate password strength
        if len(new_password) < 8:
            return api_error('Password must be at least 8 characters.', 422)
        if not re.search(r'[A-Z]', new_password):
            return api_error('Password must contain at least one uppercase letter.', 422)
        if not re.search(r'[a-z]', new_password):
            return api_error('Password must contain at least one lowercase letter.', 422)
        if not re.search(r'\d', new_password):
            return api_error('Password must contain at least one digit.', 422)

        # Decode uid
        try:
            uid = force_str(urlsafe_base64_decode(uid_b64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return api_error('Invalid or expired reset link.', 400)

        if not user.is_active:
            return api_error('This account has been deactivated.', 400)

        if not default_token_generator.check_token(user, token):
            return api_error('Invalid or expired reset link.', 400)

        user.set_password(new_password)
        user.save(update_fields=['password'])

        return api_success(None, 'Password reset successfully. You can now log in.')
