from django.db import models

from core.ids import new_id as _generate_id  # migrations import this name


class BatchStage(models.TextChoices):
    EGG = 'EGG', 'Egg'
    LARVA = 'LARVA', 'Larva'
    PUPA = 'PUPA', 'Pupa'
    COCOON = 'COCOON', 'Cocoon'
    HARVEST = 'HARVEST', 'Harvest'


class QuantityUnit(models.TextChoices):
    BOXES = 'BOXES', 'Egg boxes'
    WORMS = 'WORMS', 'Worms'


class Batch(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    farm = models.ForeignKey(
        'farms.Farm',
        on_delete=models.CASCADE,
        db_column='farmId',
        related_name='batches',
    )
    stage = models.CharField(max_length=10, choices=BatchStage.choices, default=BatchStage.EGG)
    start_date = models.DateTimeField(db_column='startDate', auto_now_add=True)
    expected_harvest_date = models.DateTimeField(db_column='expectedHarvestDate')
    notes = models.TextField(null=True, blank=True)
    breed = models.CharField(max_length=100, blank=True, default='')
    quantity = models.PositiveIntegerField(null=True, blank=True)
    quantity_unit = models.CharField(max_length=10, db_column='quantityUnit', choices=QuantityUnit.choices, default=QuantityUnit.BOXES)
    is_active = models.BooleanField(db_column='isActive', default=True)
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedAt', auto_now=True)

    class Meta:
        db_table = 'batches'
        indexes = [
            models.Index(fields=['farm'], name='batches_farm_idx'),
            models.Index(fields=['stage'], name='batches_stage_idx'),
        ]

    def __str__(self):
        return f'Batch {self.id} ({self.stage})'


class MortalityRecord(models.Model):
    """Worms that died on one day. An entry is hidden when deleted, never removed."""

    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, db_column='batchId', related_name='mortality_records')
    count = models.PositiveIntegerField()
    note = models.TextField(blank=True, default='')
    recorded_on = models.DateField(db_column='recordedOn')
    is_active = models.BooleanField(db_column='isActive', default=True)
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)

    class Meta:
        db_table = 'batch_mortality'
        indexes = [models.Index(fields=['batch'], name='mortality_batch_idx')]

    def __str__(self):
        return f'{self.count} on {self.recorded_on}'
