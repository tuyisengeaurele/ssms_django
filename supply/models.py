"""Egg supply: what a cooperative gives its farmers, and the fixed amount each farmer may take.

An allowance is a number of boxes. It changes only by a request the supervisor decides, or by a reduction, and every change
is kept in `AllowanceChange` with who made it and why.
"""
from django.conf import settings
from django.db import models
from django.db.models import Q

from core.ids import new_id as _generate_id

# A sanity bound against a slip of the finger, not a sericulture rule.
ALLOWANCE_MIN = 0
ALLOWANCE_MAX = 100


class SupplySettings(models.Model):
    """What a cooperative has chosen for its egg supply. Every number here is edited by an admin, never fixed in code."""

    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    cooperative = models.OneToOneField('cooperatives.Cooperative', on_delete=models.CASCADE, db_column='cooperativeId', related_name='supply_settings')
    # What a new farmer may take, unless the invitation says another amount. The owner is to confirm the first value.
    starter_boxes = models.PositiveIntegerField(db_column='starterBoxes', default=2)
    # Room space one box of eggs needs. Empty until a sericulture officer says, and nothing is worked out from it before then.
    m2_per_box = models.DecimalField(db_column='m2PerBox', max_digits=6, decimal_places=2, null=True, blank=True)
    updated_at = models.DateTimeField(db_column='updatedAt', auto_now=True)

    class Meta:
        db_table = 'supply_settings'

    @classmethod
    def for_cooperative(cls, cooperative) -> 'SupplySettings':
        found, _ = cls.objects.get_or_create(cooperative=cooperative)
        return found


class Allowance(models.Model):
    """The boxes a farmer may take in one round. One row per farmer, valid for the cooperative it was set in."""

    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    farmer = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_column='farmerId', related_name='allowance')
    cooperative = models.ForeignKey('cooperatives.Cooperative', on_delete=models.CASCADE, db_column='cooperativeId', related_name='+')
    boxes = models.PositiveIntegerField()
    since = models.DateTimeField(db_column='since', auto_now=True)

    class Meta:
        db_table = 'supply_allowances'


class AllowanceChange(models.Model):
    """One line of a farmer's history. The first line is the amount they started with."""

    class Kind(models.TextChoices):
        START = 'start'
        AMENDMENT = 'amendment'
        # Written by the nudge in a later step. Declared now so the history never needs a migration to say it.
        SUGGESTION = 'suggestion'
        REDUCTION = 'reduction'

    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    farmer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_column='farmerId', related_name='allowance_changes')
    cooperative = models.ForeignKey('cooperatives.Cooperative', on_delete=models.CASCADE, db_column='cooperativeId', related_name='+')
    old_boxes = models.PositiveIntegerField(db_column='oldBoxes', null=True, blank=True)
    new_boxes = models.PositiveIntegerField(db_column='newBoxes')
    kind = models.CharField(max_length=12, choices=Kind.choices)
    reason = models.TextField(blank=True, default='')
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, db_column='decidedById', related_name='+')
    decided_at = models.DateTimeField(db_column='decidedAt', auto_now_add=True)

    class Meta:
        db_table = 'supply_allowance_changes'
        ordering = ['-decided_at']


class AllowanceRequest(models.Model):
    """A farmer asking for a different allowance. The supervisor may grant another amount than the one asked."""

    class Status(models.TextChoices):
        REQUESTED = 'requested'
        APPROVED = 'approved'
        DECLINED = 'declined'
        WITHDRAWN = 'withdrawn'

    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    farmer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_column='farmerId', related_name='allowance_requests')
    cooperative = models.ForeignKey('cooperatives.Cooperative', on_delete=models.CASCADE, db_column='cooperativeId', related_name='+')
    boxes_asked = models.PositiveIntegerField(db_column='boxesAsked')
    reason = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.REQUESTED)
    boxes_granted = models.PositiveIntegerField(db_column='boxesGranted', null=True, blank=True)
    decision_note = models.TextField(db_column='decisionNote', blank=True, default='')
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, db_column='decidedById', related_name='+')
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)
    decided_at = models.DateTimeField(db_column='decidedAt', null=True, blank=True)

    class Meta:
        db_table = 'supply_allowance_requests'
        ordering = ['-created_at']
        constraints = [
            # One open request per farmer, held by the database so two taps cannot make two.
            models.UniqueConstraint(fields=['farmer'], condition=Q(status='requested'), name='one_open_allowance_request_per_farmer'),
        ]
