import time
import random
import string
from django.db import models


def _generate_id():
    ts = format(int(time.time() * 1000), 'x')
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))
    return f'c{ts}{rand}'


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

    class Meta:
        db_table = 'alert_logs'
        indexes = [
            models.Index(fields=['batch'], name='alert_batch_idx'),
            models.Index(fields=['is_read'], name='alert_is_read_idx'),
        ]

    def __str__(self):
        return f'{self.type}: {self.message[:50]}'
