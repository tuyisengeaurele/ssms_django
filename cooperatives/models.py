from django.db import models

from core.ids import new_id as _generate_id  # migrations import this name


class Cooperative(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=250, blank=True, null=True)
    is_active = models.BooleanField(db_column='isActive', default=True)
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedAt', auto_now=True)

    class Meta:
        db_table = 'cooperatives'
        ordering = ['name']

    def __str__(self):
        return self.name


class CooperativeInvitation(models.Model):
    """A link a supervisor gives to a farmer. It works once, and only while it is pending.

    Only a hash of the token is stored, so the link cannot be read back from the database or the list.
    """

    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    cooperative = models.ForeignKey(Cooperative, on_delete=models.CASCADE, db_column='cooperativeId', related_name='invitations')
    invited_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, db_column='invitedById', related_name='+',
    )
    token_hash = models.CharField(max_length=64, unique=True, db_column='tokenHash')
    # When an address is named, only that address can use the link, and the link counts as proof of the address.
    email = models.EmailField(blank=True, default='')
    expires_at = models.DateTimeField(db_column='expiresAt')
    accepted_by = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, db_column='acceptedById', related_name='+',
    )
    accepted_at = models.DateTimeField(null=True, blank=True, db_column='acceptedAt')
    revoked_at = models.DateTimeField(null=True, blank=True, db_column='revokedAt')
    created_at = models.DateTimeField(auto_now_add=True, db_column='createdAt')

    class Meta:
        db_table = 'cooperative_invitations'
        ordering = ['-created_at']

    @property
    def status(self) -> str:
        from django.utils import timezone
        if self.accepted_at:
            return 'accepted'
        if self.revoked_at:
            return 'revoked'
        if self.expires_at <= timezone.now():
            return 'expired'
        return 'pending'

    def __str__(self):
        return f'Invitation to {self.cooperative_id} ({self.status})'
