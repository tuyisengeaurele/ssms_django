from django.db import models

from core.ids import new_id as _generate_id  # migrations import this name


class QualityGrade(models.TextChoices):
    A = 'A', 'Grade A — Premium'
    B = 'B', 'Grade B — Standard'
    C = 'C', 'Grade C — Below standard'


class HarvestQuerySet(models.QuerySet):
    def live(self):
        """The records that have not been deleted. A deleted record is hidden everywhere and its row is kept."""
        return self.filter(is_active=True)


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
    is_active = models.BooleanField(db_column='isActive', default=True)
    # The secret in the address behind the lot's QR code. Empty until the farmer shares the lot, and emptied again when
    # they stop sharing it, which is what ends the link. See harvest/lots.py for what a stranger is shown.
    share_token = models.CharField(max_length=43, unique=True, null=True, blank=True, db_column='shareToken')
    shared_at = models.DateTimeField(null=True, blank=True, db_column='sharedAt')
    harvested_at = models.DateTimeField(db_column='harvestedAt', auto_now_add=True)
    created_at   = models.DateTimeField(db_column='createdAt',   auto_now_add=True)
    updated_at   = models.DateTimeField(db_column='updatedAt',   auto_now=True)

    objects = HarvestQuerySet.as_manager()

    class Meta:
        db_table = 'harvest_records'
        ordering = ['-harvested_at']

    def __str__(self):
        return f'Harvest {self.id} — {self.cocoon_weight_kg} kg'
