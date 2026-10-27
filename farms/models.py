from django.conf import settings
from django.db import models
from django.db.models.functions import Lower

from core.ids import new_id as _generate_id  # migrations import this name


class Farm(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    name = models.CharField(max_length=150)
    location = models.CharField(max_length=250)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        db_column='ownerId',
        related_name='farms',
    )
    is_active = models.BooleanField(db_column='isActive', default=True)
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedAt', auto_now=True)

    class Meta:
        db_table = 'farms'
        indexes = [
            models.Index(fields=['owner'], name='farms_owner_idx'),
        ]

    def __str__(self):
        return self.name


class RearingRoom(models.Model):
    """A room (or rearing house) on a farm. Its air is shared by every batch inside it. Deleting only hides it."""

    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    farm = models.ForeignKey(Farm, on_delete=models.CASCADE, db_column='farmId', related_name='rooms')
    name = models.CharField(max_length=100)
    notes = models.TextField(blank=True, default='')
    is_active = models.BooleanField(db_column='isActive', default=True)
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)

    class Meta:
        db_table = 'rearing_rooms'
        ordering = ['created_at']
        constraints = [
            # One live room of a name per farm, whatever the capitals. A deleted room frees its name.
            models.UniqueConstraint(
                Lower('name'), 'farm', condition=models.Q(is_active=True), name='unique_active_room_name_per_farm',
            ),
        ]

    def __str__(self):
        return self.name
