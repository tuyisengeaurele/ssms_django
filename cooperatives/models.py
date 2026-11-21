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
    # What the farmer may take per round. Empty means the cooperative's default when the invitation is used.
    starter_boxes = models.PositiveIntegerField(null=True, blank=True, db_column='starterBoxes')
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


class CooperativeMembership(models.Model):
    """A person's time in a cooperative. The open one (no end) is where they are now, and a person has at most one open.

    `users.cooperative` still says where a person is now. `cooperatives.memberships.sync_membership` keeps these rows in step
    whenever it changes, so the closed rows are the history and the open row is what a supervisor's reach is read from.
    """

    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, db_column='userId', related_name='memberships')
    cooperative = models.ForeignKey(Cooperative, on_delete=models.CASCADE, db_column='cooperativeId', related_name='memberships')
    started_at = models.DateTimeField(db_column='startedAt')
    ended_at = models.DateTimeField(db_column='endedAt', null=True, blank=True)

    class Meta:
        db_table = 'cooperative_memberships'
        ordering = ['started_at']
        indexes = [models.Index(fields=['cooperative', 'ended_at'], name='membership_coop_open_idx')]
        constraints = [
            models.UniqueConstraint(fields=['user'], condition=models.Q(ended_at__isnull=True), name='membership_one_open_per_user'),
            models.CheckConstraint(
                condition=models.Q(ended_at__isnull=True) | models.Q(ended_at__gte=models.F('started_at')), name='membership_ends_after_start',
            ),
        ]

    def __str__(self):
        return f'{self.user_id} in {self.cooperative_id}'
