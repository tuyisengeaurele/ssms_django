import re
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from .serializers import RegisterSerializer, LoginSerializer, UserSerializer, get_tokens_for_user
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
        tokens = get_tokens_for_user(user)
        log_action(request, 'CREATE', 'User', user.pk, f'Registered: {user.email}')
        return api_success(
            {'user': UserSerializer(user).data, 'token': tokens['access'], 'refreshToken': tokens['refresh']},
            'Account created successfully.',
            201,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            errors = serializer.errors
            # Flatten non_field_errors to a single message
            non_field = errors.get('non_field_errors', [])
            if non_field:
                return api_error(str(non_field[0]), 401)
            return api_error('Validation failed.', 422, errors)
        user = serializer.validated_data['user']
        tokens = get_tokens_for_user(user)
        log_action(request, 'LOGIN', 'User', user.pk, f'Login: {user.email}')
        return api_success(
            {'user': UserSerializer(user).data, 'token': tokens['access'], 'refreshToken': tokens['refresh']},
            'Logged in successfully.',
        )


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
    Blacklists the submitted refresh token so it cannot be used again.
    The client must also clear tokens from localStorage.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refreshToken') or request.data.get('refresh')
        if not refresh_token:
            return api_error('Refresh token is required.', 400)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            # Already blacklisted or invalid — treat as successful logout
            pass
        log_action(request, 'LOGOUT', 'User', request.user.pk, f'Logout: {request.user.email}')
        return api_success(None, 'Logged out successfully.')


class ChangePasswordView(APIView):
    """PATCH /api/auth/change-password — authenticated users only."""
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        current  = (request.data.get('currentPassword') or '').strip()
        new_pass = (request.data.get('newPassword') or '').strip()
        confirm  = (request.data.get('confirmPassword') or '').strip()

        if not current or not new_pass or not confirm:
            return api_error('All fields are required.', 422)

        # Verify current password
        user = authenticate(request=request, email=request.user.email, password=current)
        if not user:
            return api_error('Current password is incorrect.', 400)

        # Validate new password strength
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
