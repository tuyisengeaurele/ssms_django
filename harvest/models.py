import time, random, string
from django.db import models


def _generate_id():
    ts   = format(int(time.time() * 1000), 'x')
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))
    return f'c{ts}{rand}'


class QualityGrade(models.TextChoices):
    A = 'A', 'Grade A — Premium'
    B = 'B', 'Grade B — Standard'
    C = 'C', 'Grade C — Below standard'


class HarvestRecord(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    batch = models.ForeignKey(
        'batches.Batch',
        on_delete=models.CASCADE,
        db_column='batchId',
        related_name='harvest_records',
    )
    cocoon_weight_kg = models.DecimalField(
        max_digits=8, decimal_places=2,
        db_column='cocoonWeightKg',
    )
    silk_yield_g = models.DecimalField(
        max_digits=8, decimal_places=2,
        null=True, blank=True,
        db_column='silkYieldG',
    )
    quality_grade = models.CharField(
        max_length=1,
        choices=QualityGrade.choices,
        default=QualityGrade.A,
        db_column='qualityGrade',
    )
    notes = models.TextField(null=True, blank=True)
    harvested_at = models.DateTimeField(db_column='harvestedAt', auto_now_add=True)
    created_at   = models.DateTimeField(db_column='createdAt',   auto_now_add=True)
    updated_at   = models.DateTimeField(db_column='updatedAt',   auto_now=True)

    class Meta:
        db_table = 'harvest_records'
        ordering = ['-harvested_at']

    def __str__(self):
        return f'Harvest {self.id} — {self.cocoon_weight_kg} kg'
