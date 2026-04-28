import time
import random
import string
from django.db import models


def _generate_id():
    ts = format(int(time.time() * 1000), 'x')
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))
    return f'c{ts}{rand}'


class SensorReading(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    batch = models.ForeignKey(
        'batches.Batch',
        on_delete=models.CASCADE,
        db_column='batchId',
        related_name='sensor_readings',
    )
    temperature = models.FloatField()
    humidity = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sensor_readings'
        indexes = [
            models.Index(fields=['batch'], name='sensor_batch_idx'),
            models.Index(fields=['timestamp'], name='sensor_timestamp_idx'),
        ]

    def __str__(self):
        return f'Reading {self.id}: {self.temperature}°C / {self.humidity}%'


class DiseaseDetection(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    batch = models.ForeignKey(
        'batches.Batch',
        on_delete=models.CASCADE,
        db_column='batchId',
        related_name='disease_detections',
    )
    image_url = models.TextField(db_column='imageUrl')
    result = models.TextField()
    confidence = models.FloatField()
    detected_at = models.DateTimeField(db_column='detectedAt', auto_now_add=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'disease_detections'
        indexes = [
            models.Index(fields=['batch'], name='disease_batch_idx'),
        ]

    def __str__(self):
        return f'{self.result} ({self.confidence:.0%})'
