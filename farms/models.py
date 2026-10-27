from django.conf import settings
from django.db import models
from django.db.models.functions import Lower

from core.ids import new_id as _generate_id  # migrations import this name


class Farm(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    name = models.CharField(max_length=150)
    # The one line shown in lists and searched, made from the place below. Farms from before places keep their own text.
    location = models.CharField(max_length=250)
    # Where the farm is, as codes from the official list in the locations app. Empty on farms from before places.
    province_code = models.CharField(db_column='provinceCode', max_length=9, blank=True, default='')
    district_code = models.CharField(db_column='districtCode', max_length=9, blank=True, default='')
    sector_code = models.CharField(db_column='sectorCode', max_length=9, blank=True, default='')
    cell_code = models.CharField(db_column='cellCode', max_length=9, blank=True, default='')
    village_code = models.CharField(db_column='villageCode', max_length=9, blank=True, default='')
    street = models.CharField(max_length=200, blank=True, default='')
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
