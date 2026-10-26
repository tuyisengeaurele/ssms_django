from django.contrib.auth import authenticate, get_user_model
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework_simplejwt.tokens import RefreshToken

from core.validators import validate_new_password

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    cooperative_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'role', 'cooperative_id', 'cooperative_name', 'is_email_verified', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'name', 'email', 'role', 'cooperative_id', 'cooperative_name', 'is_email_verified', 'is_active', 'created_at', 'updated_at']

    def get_cooperative_name(self, obj):
        return obj.cooperative.name if obj.cooperative_id and obj.cooperative else None


class RegisterSerializer(serializers.Serializer):
    name     = serializers.CharField(max_length=100)
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    # Public registration always creates a FARMER.
    # ADMIN and SUPERVISOR roles are assigned by an admin after account creation.
    # The role field is intentionally NOT exposed here, any role value sent
    # by the client is silently ignored.

    def validate_email(self, value):
        if User.objects.filter(email=value.lower()).exists():
            raise serializers.ValidationError('An account with this email already exists. Try signing in instead.')
        return value.lower()

    def validate(self, attrs):
        # The password rules need the name and email, to refuse a password that is too close to them.
        candidate = User(name=attrs.get('name', ''), email=attrs.get('email', ''))
        try:
            validate_new_password(attrs['password'], candidate)
        except DRFValidationError as exc:
            raise serializers.ValidationError({'password': exc.detail}) from exc
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            name=validated_data['name'],
            role='FARMER',   # hard-coded, never trust client-supplied role
        )


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            email=attrs['email'].lower(),
            password=attrs['password'],
        )
        if not user:
            raise serializers.ValidationError("That email or password doesn't look right. Please try again.")
        if not user.is_email_verified:
            raise serializers.ValidationError('email_not_verified')
        attrs['user'] = user
        return attrs


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }
