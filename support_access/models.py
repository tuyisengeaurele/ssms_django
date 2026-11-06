"""One request by an admin to look at a farmer's or supervisor's account, and what became of it.

The row is the single record of the whole story: asked, answered, started, ended. `services.py` is the only code that
changes its status. The database allows one open request per admin and one per person, so a race between two requests
cannot make two.
"""
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.db.models import Q

from core.ids import new_id

# An unanswered request lapses after this long.
REQUEST_WAIT = timedelta(minutes=5)
# An allowed request must be started within this long of the answer.
START_WINDOW = timedelta(minutes=10)
# The lengths an admin may ask for, in minutes, and the two modes.
MINUTES = (15, 30, 60)
MODES = ('view', 'edit')
REASON_MIN = 10
REASON_MAX = 300


class SupportAccess(models.Model):
    class Status(models.TextChoices):
        REQUESTED = 'requested', 'Requested'
        APPROVED = 'approved', 'Allowed, not started'
        ACTIVE = 'active', 'Active'
        ENDED = 'ended', 'Ended'
        REJECTED = 'rejected', 'Rejected'
        EXPIRED = 'expired', 'Expired'
        CANCELLED = 'cancelled', 'Cancelled'

    # Still going: waiting for an answer, waiting to be started, or running.
    OPEN = (Status.REQUESTED, Status.APPROVED, Status.ACTIVE)

    id = models.CharField(primary_key=True, max_length=36, default=new_id, editable=False)
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='support_requests_made', db_column='adminId',
    )
    person = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='support_requests_received', db_column='personId',
    )
    # Copies, so the person's history still reads well if an account is later changed or removed.
    admin_email = models.EmailField(blank=True, db_column='adminEmail')
    admin_name = models.CharField(max_length=100, blank=True, db_column='adminName')
    person_email = models.EmailField(blank=True, db_column='personEmail')
    person_name = models.CharField(max_length=100, blank=True, db_column='personName')

    reason = models.TextField()
    minutes = models.PositiveSmallIntegerField()
    requested_mode = models.CharField(max_length=10, db_column='requestedMode')
    # Empty until the person answers. The person may grant less than was asked, never more.
    granted_mode = models.CharField(max_length=10, blank=True, default='', db_column='grantedMode')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.REQUESTED, db_index=True)

    requested_at = models.DateTimeField(auto_now_add=True, db_column='requestedAt')
    decided_at = models.DateTimeField(null=True, blank=True, db_column='decidedAt')
    started_at = models.DateTimeField(null=True, blank=True, db_column='startedAt')
    ends_at = models.DateTimeField(null=True, blank=True, db_column='endsAt')
    ended_at = models.DateTimeField(null=True, blank=True, db_column='endedAt')
    # admin, person, time or system. Empty while it is not over.
    ended_by = models.CharField(max_length=10, blank=True, default='', db_column='endedBy')
    ended_reason = models.CharField(max_length=40, blank=True, default='', db_column='endedReason')
    # The admin's own sign in that started it. When that ends, so does this.
    admin_session = models.ForeignKey(
        'users.UserSession', null=True, blank=True, on_delete=models.SET_NULL, related_name='+', db_column='adminSessionId',
    )

    class Meta:
        db_table = 'support_access'
        ordering = ['-requested_at']
        constraints = [
            models.UniqueConstraint(
                fields=['admin'], condition=Q(status__in=['requested', 'approved', 'active']), name='support_one_open_per_admin',
            ),
            models.UniqueConstraint(
                fields=['person'], condition=Q(status__in=['requested', 'approved', 'active']), name='support_one_open_per_person',
            ),
        ]

    def __str__(self):
        return f'{self.admin_email} to {self.person_email} ({self.status})'
