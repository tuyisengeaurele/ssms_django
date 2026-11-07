from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower

from core.ids import new_id as _generate_id  # migrations import this name

# The room sizes a farmer may give, in square metres. One place to change them later.
AREA_MIN = Decimal('1')
AREA_MAX = Decimal('5000')


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
    # The exact spot the farm stands on, saved from "Use my location" and rounded to about a metre. Empty until the farmer
    # saves it, and emptied when the farm moves to another sector. It is what the map shows.
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
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

    class Approval(models.TextChoices):
        APPROVED = 'approved', 'Approved'
        PENDING = 'pending', 'Waiting for a reviewer'
        REJECTED = 'rejected', 'Not approved'

    # The default is approved, so every room that exists, every room made by code and every older test stays usable. Only
    # the farmer's create path sets pending (farms/room_review.py). A pending or rejected room holds no batch or device.
    approval_status = models.CharField(
        max_length=10, choices=Approval.choices, default=Approval.APPROVED, db_index=True, db_column='approvalStatus',
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+', db_column='reviewedById',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True, db_column='reviewedAt')
    review_note = models.TextField(blank=True, default='', db_column='reviewNote')
    # Square metres. Empty on rooms made before sizes existed. A change to an approved room waits in pending_area_m2, and
    # the old size stays in force until a reviewer approves the new one.
    area_m2 = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True, db_column='areaM2')
    pending_area_m2 = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True, db_column='pendingAreaM2')

    @property
    def usable(self) -> bool:
        """True when the room may hold a batch or a device."""
        return self.approval_status == self.Approval.APPROVED

    @property
    def needs_review(self) -> bool:
        """True while a reviewer has something to decide: a new room, or a size change on an approved room."""
        return self.approval_status == self.Approval.PENDING or self.pending_area_m2 is not None

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
