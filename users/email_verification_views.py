"""
Email verification flow:
  POST /api/auth/verify-email   { uid, token }
      → marks the user as verified. It never signs anyone in: the person signs in afterwards.
  POST /api/auth/resend-verification   { email }
      → sends a fresh verification link (rate-limited)
"""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from core.mail import Email, send_email
from core.throttles import PasswordResetRateThrottle
from core.utils import api_error, api_success

from .tokens import email_verification_token

User = get_user_model()
logger = logging.getLogger(__name__)


def _send_verification_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = email_verification_token.make_token(user)
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    verify_url = f'{frontend_url}/verify-email?uid={uid}&token={token}'

    send_email(
        'Verify your SSMS email address',
        [user.email],
        Email(
            heading='Verify your email address',
            greeting=f'Hi {user.name},',
            intro=('Welcome to SSMS. Please confirm this address to start using your account.',),
            button=('Verify my email', verify_url),
            closing=('The link works for 1 hour. If you did not create an account, you can ignore this email.',),
            reason='You received this because an SSMS account was created with this address.',
        ),
    )


class VerifyEmailView(APIView):
    # A leftover token in the browser must not block a public page.
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        uid_b64 = request.data.get('uid', '')
        token = request.data.get('token', '')

        if not uid_b64 or not token:
            return api_error('This link is incomplete. Please request a new one.', 422)

        try:
            uid = force_str(urlsafe_base64_decode(uid_b64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return api_error("This verification link has expired or isn't valid. Please request a new one.", 400)

        if not user.is_active:
            return api_error('This account has been deleted. Please contact the SSMS team.', 400)

        if user.is_email_verified:
            # A link that was already used. Say so, and hand out nothing.
            return api_success(None, 'Your email is already verified. You can sign in.')

        if not email_verification_token.check_token(user, token):
            return api_error("This verification link has expired or isn't valid. Please request a new one.", 400)

        user.is_email_verified = True
        user.save(update_fields=['is_email_verified'])
        return api_success(None, 'Email verified. You can now sign in.')


class ResendVerificationView(APIView):
    # A leftover token in the browser must not block a public page.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        email = str(request.data.get('email', '')).strip().lower()
        if not email:
            return api_error('Please enter your email address.', 422)

        # The same answer for an unknown address, a verified one, a deleted account and a
        # real one waiting for its link, so this page cannot be used to find out who has an account.
        user = User.objects.filter(email=email, is_active=True, is_email_verified=False).first()
        if user is not None:
            try:
                _send_verification_email(user)
            except Exception:
                logger.exception('Could not send the verification email to %s', user.email)
        return api_success(None, 'If that email is registered and unverified, a new link has been sent.')
