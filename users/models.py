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
