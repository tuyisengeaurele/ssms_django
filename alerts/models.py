from django.db import models

from batches.models import BatchStage
from core.ids import new_id as _generate_id  # migrations import this name


class AlertType(models.TextChoices):
    TEMPERATURE = 'TEMPERATURE', 'Temperature'
    HUMIDITY = 'HUMIDITY', 'Humidity'
    DISEASE = 'DISEASE', 'Disease'
    STAGE_CHANGE = 'STAGE_CHANGE', 'Stage Change'
    SYSTEM = 'SYSTEM', 'System'


class AlertLog(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    batch = models.ForeignKey(
        'batches.Batch',
        on_delete=models.CASCADE,
        db_column='batchId',
        related_name='alert_logs',
    )
    type = models.CharField(max_length=20, choices=AlertType.choices)
    message = models.TextField()
    is_read = models.BooleanField(db_column='isRead', default=False)
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)
    # A temperature or humidity alert stays open while the problem lasts. This is set when a good reading closes it.
    resolved_at = models.DateTimeField(db_column='resolvedAt', null=True, blank=True)

    class Meta:
        db_table = 'alert_logs'
        indexes = [
            models.Index(fields=['batch'], name='alert_batch_idx'),
            models.Index(fields=['is_read'], name='alert_is_read_idx'),
        ]

    def __str__(self):
        return f'{self.type}: {self.message[:50]}'


class StageThreshold(models.Model):
    """The safe temperature and humidity range for one stage of a batch. An admin can change it."""

    stage = models.CharField(primary_key=True, max_length=10, choices=BatchStage.choices)
    temp_min = models.FloatField(db_column='tempMin', default=22.0)
    temp_max = models.FloatField(db_column='tempMax', default=28.0)
    hum_min = models.FloatField(db_column='humMin', default=70.0)
    hum_max = models.FloatField(db_column='humMax', default=85.0)
    updated_at = models.DateTimeField(db_column='updatedAt', auto_now=True)

    class Meta:
        db_table = 'stage_thresholds'

    def __str__(self):
        return f'{self.stage}: {self.temp_min} to {self.temp_max} C, {self.hum_min} to {self.hum_max} %'
