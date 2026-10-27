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
    # A link from a supervisor. With it, the new farmer joins that cooperative.
    invitation = serializers.CharField(write_only=True, required=False, allow_blank=True)

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

        self.invitation = None
        token = (attrs.get('invitation') or '').strip()
        if token:
            from cooperatives import invitations
            self.invitation = invitations.find_pending(token)
            if self.invitation is None:
                raise serializers.ValidationError({'invitation': invitations.NO_LONGER_VALID})
            if self.invitation.email and self.invitation.email != attrs['email']:
                raise serializers.ValidationError({'email': 'Please use the email address this invitation was sent to.'})
        return attrs

    def create(self, validated_data):
        from django.db import transaction

        # Making the account and using the invitation are one step, so a link that was just used cannot leave
        # a farmer behind who is in no cooperative.
        with transaction.atomic():
            user = User.objects.create_user(
                email=validated_data['email'],
                password=validated_data['password'],
                name=validated_data['name'],
                role='FARMER',   # hard-coded, never trust client-supplied role
            )
            if self.invitation is not None:
                from cooperatives import invitations
                try:
                    invitations.accept(self.invitation, user)
                except invitations.InvalidInvitation as exc:
                    raise serializers.ValidationError({'invitation': str(exc)}) from exc
                if self.invitation.email:
                    # The link went to this address and was used, which proves the person reads it.
                    user.is_email_verified = True
                    user.save(update_fields=['is_email_verified'])
        return user


class AdminCreateUserSerializer(serializers.Serializer):
    """An administrator adds a person. The role is honoured, and the address counts as verified.

    With a password the person can sign in at once. Without one they get an email link to choose it.
    """
    name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=['ADMIN', 'SUPERVISOR', 'FARMER'], default='FARMER')
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    cooperative_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate_email(self, value):
        if User.objects.filter(email=value.lower()).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value.lower()

    def validate(self, attrs):
        from cooperatives.models import Cooperative

        attrs['cooperative'] = None
        coop_id = attrs.pop('cooperative_id', None)
        if coop_id:
            if attrs['role'] == 'ADMIN':
                raise serializers.ValidationError({'cooperative_id': "Administrators don't belong to a cooperative."})
            coop = Cooperative.objects.filter(pk=coop_id, is_active=True).first()
            if coop is None:
                raise serializers.ValidationError({'cooperative_id': "We couldn't find that cooperative."})
            attrs['cooperative'] = coop

        password = attrs.get('password') or None
        if password:
            candidate = User(name=attrs['name'], email=attrs['email'])
            try:
                validate_new_password(password, candidate)
            except DRFValidationError as exc:
                raise serializers.ValidationError({'password': exc.detail}) from exc
        attrs['password'] = password
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],   # None leaves the password unusable until they choose one
            name=validated_data['name'],
            role=validated_data['role'],
            cooperative=validated_data['cooperative'],
            is_email_verified=True,
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
