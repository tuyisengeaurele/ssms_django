from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
from django.db import models

from core.ids import new_id as _generate_id  # migrations import this name


class Role(models.TextChoices):
    ADMIN = 'ADMIN', 'Admin'
    SUPERVISOR = 'SUPERVISOR', 'Supervisor'
    FARMER = 'FARMER', 'Farmer'


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        extra_fields.setdefault('role', Role.FARMER)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields['role'] = Role.ADMIN
        extra_fields.setdefault('is_email_verified', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.FARMER)
    cooperative = models.ForeignKey(
        'cooperatives.Cooperative',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='cooperativeId',
        related_name='members',
    )
    is_active = models.BooleanField(db_column='isActive', default=True)
    is_email_verified = models.BooleanField(db_column='isEmailVerified', default=False)
    # When the person ticked the box for the terms and the privacy policy while creating the account. Empty if they did not.
    terms_accepted_at = models.DateTimeField(db_column='termsAcceptedAt', null=True, blank=True)
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedAt', auto_now=True)

    # Remove last_login — not in Prisma schema
    last_login = None

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    objects = UserManager()

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.email

    # Required by simplejwt and Django internals
    @property
    def is_staff(self):
        return self.role == Role.ADMIN


class UserSession(models.Model):
    """One signed in browser or app. Its id travels inside the tokens as the claim `sid`.

    The refresh token in the cookie changes on every renewal. The row remembers the recent ones and which were used,
    so a renewal whose answer never arrived can be asked again without signing the person out.
    """
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions', db_column='userId')
    # The last few refresh tokens handed out: [{'jti': ..., 'used_at': seconds or None}]. A token is used once.
    # Using it again soon, from the same browser, is a renewal whose answer was lost. Using it again later is theft.
    tokens = models.JSONField(default=list, blank=True)
    device_label = models.CharField(max_length=80, blank=True, default='', db_column='deviceLabel')
    browser = models.CharField(max_length=40, blank=True, default='')
    os = models.CharField(max_length=40, blank=True, default='')
    is_installed_app = models.BooleanField(default=False, db_column='isInstalledApp')
    # Ticked at sign in: other people may use this computer, so a forgotten sign in must end sooner.
    is_shared_device = models.BooleanField(default=False, db_column='isSharedDevice')
    user_agent = models.CharField(max_length=300, blank=True, default='', db_column='userAgent')
    created_at = models.DateTimeField(auto_now_add=True, db_column='createdAt')
    last_used_at = models.DateTimeField(db_column='lastUsedAt')
    last_activity_at = models.DateTimeField(db_column='lastActivityAt')
    expires_at = models.DateTimeField(db_column='expiresAt')
    revoked_at = models.DateTimeField(null=True, blank=True, db_column='revokedAt')
    revoked_reason = models.CharField(max_length=20, blank=True, default='', db_column='revokedReason')
    # When a code from the authenticator app was last checked in this sign in. Empty means never: an admin session
    # without it is refused. Actions that want a recent code compare it with the clock.
    mfa_verified_at = models.DateTimeField(null=True, blank=True, db_column='mfaVerifiedAt')
    # Set only on a sign in made for support access. It belongs to the person, but it is not one of their devices.
    support_access = models.ForeignKey(
        'support_access.SupportAccess', null=True, blank=True, on_delete=models.SET_NULL, related_name='support_sessions',
        db_column='supportAccessId',
    )

    class Meta:
        db_table = 'user_sessions'
        indexes = [models.Index(fields=['user', 'revoked_at'], name='user_sessions_user_revoked')]

    @staticmethod
    def ends_at(start):
        """The last moment a session can live, however often it is renewed."""
        from datetime import timedelta

        from django.conf import settings
        return start + timedelta(days=settings.SESSION_ABSOLUTE_DAYS)

    def is_alive(self, now) -> bool:
        return self.revoked_at is None and now < self.expires_at


class SecondFactor(models.Model):
    """An admin's authenticator app. Both secrets are stored encrypted, never as the text the phone holds.

    A secret waits in `pending_secret_encrypted` while the person is setting up. It becomes the active one, and
    `enabled_at` is set, only when they type a correct code from it.
    """
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='second_factor', db_column='userId')
    secret_encrypted = models.TextField(blank=True, default='', db_column='secretEncrypted')
    pending_secret_encrypted = models.TextField(blank=True, default='', db_column='pendingSecretEncrypted')
    enabled_at = models.DateTimeField(null=True, blank=True, db_column='enabledAt')
    # The last 30 second step whose code was accepted. A code for that step or an older one is refused, so a code that
    # was seen once cannot be used again.
    last_step = models.BigIntegerField(default=0, db_column='lastStep')
    created_at = models.DateTimeField(auto_now_add=True, db_column='createdAt')
    updated_at = models.DateTimeField(auto_now=True, db_column='updatedAt')

    class Meta:
        db_table = 'second_factors'


class RecoveryCode(models.Model):
    """One use only, for a lost phone. Only an HMAC of the code is stored."""
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recovery_codes', db_column='userId')
    code_hash = models.CharField(max_length=64, db_column='codeHash')
    used_at = models.DateTimeField(null=True, blank=True, db_column='usedAt')
    created_at = models.DateTimeField(auto_now_add=True, db_column='createdAt')

    class Meta:
        db_table = 'recovery_codes'
        indexes = [models.Index(fields=['user', 'code_hash'], name='recovery_codes_user_hash')]
