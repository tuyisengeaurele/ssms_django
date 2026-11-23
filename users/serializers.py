from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError

from core.validators import validate_new_password

from .phone_numbers import normalize_rwanda_mobile

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    cooperative_name = serializers.SerializerMethodField()
    phone_verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'name', 'email', 'role', 'cooperative_id', 'cooperative_name', 'is_email_verified', 'is_active',
            'phone', 'phone_verified', 'photo_url', 'preferred_language', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_cooperative_name(self, obj):
        return obj.cooperative.name if obj.cooperative_id and obj.cooperative else None

    def get_phone_verified(self, obj):
        return obj.phone_verified_at is not None


class PhoneField(serializers.CharField):
    """An optional Rwandan mobile number. Any usual way of writing it is accepted and it is kept as +250 and nine digits.
    Empty, blank or null all mean no number. Anything else that is not a Rwandan mobile is refused with the code `invalid_phone`."""

    def __init__(self, **kwargs):
        kwargs.setdefault('required', False)
        kwargs.setdefault('allow_blank', True)
        kwargs.setdefault('allow_null', True)
        kwargs.setdefault('max_length', 40)
        super().__init__(**kwargs)

    def run_validation(self, data=serializers.empty):
        value = super().run_validation(data)
        if value is None or not str(value).strip():
            return None
        try:
            return normalize_rwanda_mobile(value)
        except DjangoValidationError:
            raise serializers.ValidationError('Enter a Rwandan mobile number, for example 0788 123 456.', code='invalid_phone') from None


class RegisterSerializer(serializers.Serializer):
    name     = serializers.CharField(max_length=100)
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    accepted_terms = serializers.BooleanField(write_only=True, required=False, default=False)
    # Optional. Kept as written by the person and not confirmed: there is no way to send a code yet.
    phone = PhoneField()
    # A link from a supervisor. With it, the new farmer joins that cooperative.
    invitation = serializers.CharField(write_only=True, required=False, allow_blank=True)

    # Public registration always creates a FARMER.
    # ADMIN and SUPERVISOR roles are assigned by an admin after account creation.
    # The role field is intentionally NOT exposed here, any role value sent
    # by the client is silently ignored.

    def validate_email(self, value):
        if User.objects.filter(email=value.lower()).exists():
            raise serializers.ValidationError('An account with this email already exists. Try signing in instead.', code='email_taken')
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
                phone=validated_data.get('phone'),
                role='FARMER',   # hard-coded, never trust client-supplied role
            )
            if validated_data.get('accepted_terms'):
                user.terms_accepted_at = timezone.now()
                user.save(update_fields=['terms_accepted_at'])
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
    phone = PhoneField()

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
            phone=validated_data.get('phone'),
            is_email_verified=True,
        )


class ProfileUpdateSerializer(serializers.Serializer):
    """What a person can change about themselves: their name and their phone number. Either, or both. An empty number removes it."""
    name = serializers.CharField(required=False, allow_blank=True, max_length=100, error_messages={'max_length': 'Please keep your name under 100 characters.'})
    phone = PhoneField()

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Please enter your name.')
        return value


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
            raise serializers.ValidationError("That email or password doesn't look right. Please try again.", code='bad_login')
        if not user.is_email_verified:
            raise serializers.ValidationError('email_not_verified')
        attrs['user'] = user
        return attrs
