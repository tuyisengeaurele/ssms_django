import logging

from django.contrib.auth import authenticate
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from audit_log.utils import log_action
from core.throttles import LoginRateThrottle, RegisterRateThrottle
from core.tokens import revoke_all_refresh_tokens
from core.utils import api_error, api_success, body_field
from core.validators import validate_new_password

from .cookie_utils import REFRESH_COOKIE, clear_refresh_cookie, set_refresh_cookie
from .email_verification_views import _send_verification_email
from .serializers import LoginSerializer, RegisterSerializer, UserSerializer, get_tokens_for_user

logger = logging.getLogger(__name__)


class RegisterView(APIView):
    # A leftover token in the browser must not block a public page.
    authentication_classes = []
    permission_classes  = [AllowAny]
    throttle_classes    = [RegisterRateThrottle]   # 20 registrations/minute per IP

    def post(self, request):
        serializer = RegisterSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        user = serializer.save()
        log_action(request, 'CREATE', 'User', user.pk, f'Registered: {user.email}')
        try:
            _send_verification_email(user)
        except Exception:
            # A mail problem must not block sign up. The person can ask for a new link.
            logger.exception('Could not send the verification email to %s', user.email)
        return api_success(
            {'user': UserSerializer(user).data},
            'Account created. Please check your email to verify your address.',
            201,
        )


class LoginView(APIView):
    # A leftover token in the browser must not block a public page.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            errors = serializer.errors
            non_field = errors.get('non_field_errors', [])
            if non_field:
                return api_error(str(non_field[0]), 401)
            return api_error('Please check what you entered and try again.', 422, errors)
        user = serializer.validated_data['user']
        tokens = get_tokens_for_user(user)
        log_action(request, 'LOGIN', 'User', user.pk, f'Login: {user.email}', actor=user)
        response = api_success(
            {'user': UserSerializer(user).data, 'token': tokens['access']},
            'Logged in successfully.',
        )
        set_refresh_cookie(response, tokens['refresh'])
        return response


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return api_success(UserSerializer(request.user).data)

    def patch(self, request):
        name = request.data.get('name', '').strip()
        if not name:
            return api_error('Please enter your name.', 422)
        if len(name) > 100:
            return api_error('Please keep your name under 100 characters.', 422)
        request.user.name = name
        request.user.save(update_fields=['name'])
        return api_success(UserSerializer(request.user).data, 'Profile updated.')


class LogoutView(APIView):
    """
    POST /api/auth/logout
    Blacklists the refresh token from the httpOnly cookie.
    Does not require a valid access token, the cookie is the sole credential.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        refresh_token_str = request.COOKIES.get(REFRESH_COOKIE)
        actor = None

        if refresh_token_str:
            try:
                token = RefreshToken(refresh_token_str)
                actor = User.objects.get(pk=token.payload['user_id'])
                token.blacklist()
            except (TokenError, KeyError, User.DoesNotExist):
                pass  # Already blacklisted or invalid, still clear the cookie

        if actor:
            log_action(request, 'LOGOUT', 'User', actor.pk, f'Logout: {actor.email}', actor=actor)

        response = api_success(None, 'Logged out successfully.')
        clear_refresh_cookie(response)
        return response


class CookieTokenRefreshView(APIView):
    """
    POST /api/auth/token/refresh
    Reads the refresh token from the httpOnly cookie, returns a new access token,
    and rotates the refresh token (sets a new cookie).
    """
    # A leftover token in the browser must not block a public page.
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        refresh_token_str = request.COOKIES.get(REFRESH_COOKIE)
        if not refresh_token_str:
            return api_error('Your session has ended. Please sign in again.', 401)
        try:
            refresh = RefreshToken(refresh_token_str)
            # A deactivated or deleted account cannot renew a session.
            user = User.objects.filter(pk=refresh['user_id']).first()
            if user is None or not user.is_active:
                return api_error('Your session has ended. Please sign in again.', 401)
            access_token = str(refresh.access_token)
            # Rotate: blacklist old, generate new refresh token
            refresh.blacklist()
            refresh.set_jti()
            refresh.set_exp()
            new_refresh_str = str(refresh)
        except TokenError:
            return api_error('Your session has ended. Please sign in again.', 401)
        response = Response({'access': access_token})
        set_refresh_cookie(response, new_refresh_str)
        return response


class ChangePasswordView(APIView):
    """PATCH /api/auth/change-password, authenticated users only."""
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        current  = body_field(request.data, 'current_password', 'currentPassword').strip()
        new_pass = body_field(request.data, 'new_password', 'newPassword').strip()
        confirm  = body_field(request.data, 'confirm_password', 'confirmPassword').strip()

        if not current or not new_pass or not confirm:
            return api_error('Please fill in every field.', 422)

        user = authenticate(request=request, email=request.user.email, password=current)
        if not user:
            return api_error("Your current password isn't right. Please try again.", 400)

        try:
            validate_new_password(new_pass, request.user)
        except DRFValidationError as exc:
            return api_error(str(exc.detail[0]), 422, {'new_password': exc.detail})
        if new_pass != confirm:
            return api_error("The two passwords don't match.", 422)
        if new_pass == current:
            return api_error('Please choose a new password that is different from the current one.', 422)

        request.user.set_password(new_pass)
        request.user.save(update_fields=['password'])

        # Every other device is signed out. This one gets a fresh session so the person is not.
        revoke_all_refresh_tokens(request.user)
        tokens = get_tokens_for_user(request.user)
        response = api_success({'token': tokens['access']}, 'Password changed successfully.')
        set_refresh_cookie(response, tokens['refresh'])
        return response
