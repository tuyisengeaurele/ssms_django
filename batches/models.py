import time
import random
import string
from django.db import models


def _generate_id():
    ts = format(int(time.time() * 1000), 'x')
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))
    return f'c{ts}{rand}'


class BatchStage(models.TextChoices):
    EGG = 'EGG', 'Egg'
    LARVA = 'LARVA', 'Larva'
    PUPA = 'PUPA', 'Pupa'
    COCOON = 'COCOON', 'Cocoon'
    HARVEST = 'HARVEST', 'Harvest'


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
