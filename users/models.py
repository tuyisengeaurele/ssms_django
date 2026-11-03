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

    The refresh token in the cookie changes on every renewal. The row remembers the current one and the one it
    replaced, so a renewal whose answer never arrived can be asked again without signing the person out.
    """
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions', db_column='userId')
    refresh_jti = models.CharField(max_length=64, unique=True, db_column='refreshJti')
    previous_jti = models.CharField(max_length=64, blank=True, default='', db_column='previousJti')
    rotated_at = models.DateTimeField(null=True, blank=True, db_column='rotatedAt')
    device_label = models.CharField(max_length=80, blank=True, default='', db_column='deviceLabel')
    browser = models.CharField(max_length=40, blank=True, default='')
    os = models.CharField(max_length=40, blank=True, default='')
    is_installed_app = models.BooleanField(default=False, db_column='isInstalledApp')
    custom_name = models.CharField(max_length=40, blank=True, default='', db_column='customName')
    user_agent = models.CharField(max_length=300, blank=True, default='', db_column='userAgent')
    ip_address = models.GenericIPAddressField(null=True, blank=True, db_column='ipAddress')
    created_at = models.DateTimeField(auto_now_add=True, db_column='createdAt')
    last_used_at = models.DateTimeField(db_column='lastUsedAt')
    last_activity_at = models.DateTimeField(db_column='lastActivityAt')
    expires_at = models.DateTimeField(db_column='expiresAt')
    revoked_at = models.DateTimeField(null=True, blank=True, db_column='revokedAt')
    revoked_reason = models.CharField(max_length=20, blank=True, default='', db_column='revokedReason')

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
