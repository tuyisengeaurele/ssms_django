"""
Email verification flow:
  POST /api/auth/verify-email   { uid, token }
      → marks user as verified, returns tokens for auto-login
  POST /api/auth/resend-verification   { email }
      → sends a fresh verification link (rate-limited)
"""
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
from .serializers import UserSerializer, get_tokens_for_user
from .views import _set_refresh_cookie

User = get_user_model()


def _send_verification_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    verify_url = f'{frontend_url}/verify-email?uid={uid}&token={token}'

    send_mail(
        subject='Verify your SSMS email address',
        message=(
            f'Hi {user.name},\n\n'
            f'Welcome to SSMS! Please verify your email address by clicking the link below:\n\n'
            f'{verify_url}\n\n'
            f'This link is valid for 1 hour. If you did not create an account, you can safely ignore this email.\n\n'
            f'— The SSMS Team'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        uid_b64 = request.data.get('uid', '')
        token = request.data.get('token', '')

        if not uid_b64 or not token:
            return api_error('uid and token are required.', 422)

        try:
            uid = force_str(urlsafe_base64_decode(uid_b64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return api_error('Invalid or expired verification link.', 400)

        if not user.is_active:
            return api_error('This account has been deactivated.', 400)

        if user.is_email_verified:
            tokens = get_tokens_for_user(user)
            response = api_success(
                {'user': UserSerializer(user).data, 'token': tokens['access']},
                'Email already verified.',
            )
            _set_refresh_cookie(response, tokens['refresh'])
            return response

        if not default_token_generator.check_token(user, token):
            return api_error('Invalid or expired verification link.', 400)

        user.is_email_verified = True
        user.save(update_fields=['is_email_verified'])

        tokens = get_tokens_for_user(user)
        response = api_success(
            {'user': UserSerializer(user).data, 'token': tokens['access']},
            'Email verified successfully.',
        )
        _set_refresh_cookie(response, tokens['refresh'])
        return response


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return api_error('Email is required.', 422)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Don't reveal whether the email exists
            return api_success(None, 'If that email is registered and unverified, a new link has been sent.')

        if user.is_email_verified:
            return api_success(None, 'This email address is already verified.')

        if not user.is_active:
            return api_success(None, 'If that email is registered and unverified, a new link has been sent.')

        _send_verification_email(user)
        return api_success(None, 'If that email is registered and unverified, a new link has been sent.')
