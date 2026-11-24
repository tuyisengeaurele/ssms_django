from contextlib import contextmanager

from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError

from core.validators import validate_new_password

from .phone_numbers import normalize_rwanda_mobile, phone_in_use

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    cooperative_name = serializers.SerializerMethodField()
    phone_verified = serializers.SerializerMethodField()
    phone_required = serializers.SerializerMethodField()
    supervisor = serializers.SerializerMethodField()
    deletion_date = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'name', 'email', 'role', 'cooperative_id', 'cooperative_name', 'is_email_verified', 'is_active',
            'phone', 'phone_verified', 'phone_required', 'supervisor', 'deletion_date',
            'photo_url', 'preferred_language', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_cooperative_name(self, obj):
        return obj.cooperative.name if obj.cooperative_id and obj.cooperative else None

    def get_phone_verified(self, obj):
        return obj.phone_verified_at is not None

    def get_deletion_date(self, obj):
        """The day the account is removed, as a date, while a closure is scheduled. Otherwise None."""
        from .closure import removal_date
        when = removal_date(obj)
        return when.date().isoformat() if when else None

    def get_supervisor(self, obj):
        """The supervisor of a farmer's cooperative, for the farmer's own screen, or None. Only asked for with
        context={'with_supervisor': True}: a list of accounts would otherwise cost a query per row."""
        if not self.context.get('with_supervisor') or obj.role != 'FARMER' or not obj.cooperative_id:
            return None
        found = User.objects.filter(role='SUPERVISOR', cooperative_id=obj.cooperative_id, is_active=True).order_by('name').first()
        if found is None:
            return None
        return {'id': found.pk, 'name': found.name, 'phone': found.phone, 'photo_url': found.photo_url}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self.context.get('with_supervisor'):
            data.pop('supervisor', None)
        return data

    def get_phone_required(self, obj):
        # True for an account with no number: the page then shows the screen that asks for one.
        return not obj.phone


PHONE_REQUIRED = 'Please enter your phone number.'
PHONE_CONFIRM = 'Type your current phone number to confirm the change.'
PHONE_TAKEN = 'This phone number is already used by another account. Contact the SSMS team if it is yours.'


class PhoneField(serializers.CharField):
    """A Rwandan mobile number. Any usual way of writing it is accepted and it is kept as +250 and nine digits.
    Anything that is not a Rwandan mobile is refused with the code `invalid_phone`.

    With `mandatory`, a missing, null, blank or spaces-only value is refused with the code `phone_required`. Without it,
    all of those mean no number."""

    def __init__(self, mandatory=False, **kwargs):
        self.mandatory = mandatory
        kwargs.setdefault('required', False)
        kwargs.setdefault('allow_blank', True)
        kwargs.setdefault('allow_null', True)
        kwargs.setdefault('max_length', 40)
        super().__init__(**kwargs)

    def run_validation(self, data=serializers.empty):
        if self.mandatory and (data is serializers.empty or data is None or not str(data).strip()):
            raise serializers.ValidationError(PHONE_REQUIRED, code='phone_required')
        value = super().run_validation(data)
        if value is None or not str(value).strip():
            return None
        try:
            return normalize_rwanda_mobile(value)
        except DjangoValidationError:
            raise serializers.ValidationError('Enter a Rwandan mobile number, for example 0788123456.', code='invalid_phone') from None


def _free_number(value):
    """The number, when no account holds it yet. The refusal never says whose it is."""
    if value is not None and phone_in_use(value):
        raise serializers.ValidationError(PHONE_TAKEN, code='phone_taken')
    return value


@contextmanager
def _number_race():
    """Two people saving the same number at the same moment both pass the friendly check. The database refuses the second one."""
    try:
        yield
    except IntegrityError as exc:
        if 'users_phone_unique' not in str(exc):
            raise
        raise serializers.ValidationError({'phone': [serializers.ErrorDetail(PHONE_TAKEN, code='phone_taken')]}) from exc


class RegisterSerializer(serializers.Serializer):
    name     = serializers.CharField(max_length=100)
    email    = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    accepted_terms = serializers.BooleanField(write_only=True, required=False, default=False)
    # Required. Kept in one form (+250 and nine digits), whichever way the person wrote it.
    phone = PhoneField(mandatory=True)
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

    def validate_phone(self, value):
        return _free_number(value)

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
        with transaction.atomic(), _number_race():
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
    phone = PhoneField(mandatory=True)

    def validate_email(self, value):
        if User.objects.filter(email=value.lower()).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value.lower()

    def validate_phone(self, value):
        return _free_number(value)

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
        with _number_race():
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
    """What a person can change about themselves: their name and their phone number. Either, or both.

    A number cannot be emptied here (the view refuses it), and replacing one needs `confirm_phone`: the current number, typed."""
    name = serializers.CharField(required=False, allow_blank=True, max_length=100, error_messages={'max_length': 'Please keep your name under 100 characters.'})
    phone = PhoneField()
    confirm_phone = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=40)

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
