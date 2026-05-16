from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from .serializers import RegisterSerializer, LoginSerializer, UserSerializer, get_tokens_for_user
from core.utils import api_success, api_error
from core.throttles import LoginRateThrottle, RegisterRateThrottle


class RegisterView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [RegisterRateThrottle]   # 20 registrations/minute per IP

    def post(self, request):
        serializer = RegisterSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)
        user = serializer.save()
        tokens = get_tokens_for_user(user)
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
