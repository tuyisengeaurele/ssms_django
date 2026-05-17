import re
from django.contrib.auth import authenticate
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from .serializers import RegisterSerializer, LoginSerializer, UserSerializer, get_tokens_for_user
from .email_verification_views import _send_verification_email
from .cookie_utils import REFRESH_COOKIE, set_refresh_cookie, clear_refresh_cookie
from core.utils import api_success, api_error
from core.throttles import LoginRateThrottle, RegisterRateThrottle
from audit_log.utils import log_action


class RegisterView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [RegisterRateThrottle]   # 20 registrations/minute per IP

    def post(self, request):
        serializer = RegisterSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)
        user = serializer.save()
        log_action(request, 'CREATE', 'User', user.pk, f'Registered: {user.email}')
        try:
            _send_verification_email(user)
        except Exception:
            pass  # email failure must not block account creation
        return api_success(
            {'user': UserSerializer(user).data},
            'Account created. Please check your email to verify your address.',
            201,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            errors = serializer.errors
            non_field = errors.get('non_field_errors', [])
            if non_field:
                return api_error(str(non_field[0]), 401)
            return api_error('Validation failed.', 422, errors)
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
            return api_error('Name is required.', 422)
        if len(name) > 100:
            return api_error('Name cannot exceed 100 characters.', 422)
        request.user.name = name
        request.user.save(update_fields=['name'])
        return api_success(UserSerializer(request.user).data, 'Profile updated.')


class LogoutView(APIView):
    """
    POST /api/auth/logout
    Blacklists the refresh token from the httpOnly cookie.
    Does not require a valid access token — the cookie is the sole credential.
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
                pass  # Already blacklisted or invalid — still clear the cookie

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
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token_str = request.COOKIES.get(REFRESH_COOKIE)
        if not refresh_token_str:
            return Response({'detail': 'No refresh token.'}, status=401)
        try:
            refresh = RefreshToken(refresh_token_str)
            access_token = str(refresh.access_token)
            # Rotate: blacklist old, generate new refresh token
            refresh.blacklist()
            refresh.set_jti()
            refresh.set_exp()
            new_refresh_str = str(refresh)
        except TokenError:
            return Response({'detail': 'Token is invalid or expired.'}, status=401)
        response = Response({'access': access_token})
        set_refresh_cookie(response, new_refresh_str)
        return response


class ChangePasswordView(APIView):
    """PATCH /api/auth/change-password — authenticated users only."""
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        current  = (request.data.get('currentPassword') or '').strip()
        new_pass = (request.data.get('newPassword') or '').strip()
        confirm  = (request.data.get('confirmPassword') or '').strip()

        if not current or not new_pass or not confirm:
            return api_error('All fields are required.', 422)

        user = authenticate(request=request, email=request.user.email, password=current)
        if not user:
            return api_error('Current password is incorrect.', 400)

        if len(new_pass) < 8:
            return api_error('New password must be at least 8 characters.', 422)
        if not re.search(r'[A-Z]', new_pass):
            return api_error('New password must contain at least one uppercase letter.', 422)
        if not re.search(r'[a-z]', new_pass):
            return api_error('New password must contain at least one lowercase letter.', 422)
        if not re.search(r'\d', new_pass):
            return api_error('New password must contain at least one digit.', 422)
        if new_pass != confirm:
            return api_error('Passwords do not match.', 422)
        if new_pass == current:
            return api_error('New password must be different from the current password.', 422)

        request.user.set_password(new_pass)
        request.user.save(update_fields=['password'])
        return api_success(None, 'Password changed successfully.')
