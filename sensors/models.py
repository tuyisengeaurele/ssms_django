from django.db import models

from core.ids import new_id as _generate_id  # migrations import this name


class IoTDevice(models.Model):
    """A named IoT sensor device (physical or simulated). It belongs to a farm and measures one room of it."""

    STATUS_ONLINE  = 'online'
    STATUS_OFFLINE = 'offline'
    STATUS_ERROR   = 'error'
    STATUS_CHOICES = [
        (STATUS_ONLINE,  'Online'),
        (STATUS_OFFLINE, 'Offline'),
        (STATUS_ERROR,   'Error'),
    ]

    id         = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    name       = models.CharField(max_length=100)          # e.g. "DHT22-Sector-A"
    device_key = models.CharField(max_length=80, unique=True)  # stable unique identifier
    farm       = models.ForeignKey(
        'farms.Farm',
        on_delete=models.SET_NULL, null=True, blank=True,
        db_column='farmId', related_name='devices',
    )
    # Where the sensor is. It measures the air of this room, which every batch in the room shares. A device never names a batch.
    room       = models.ForeignKey(
        'farms.RearingRoom',
        on_delete=models.SET_NULL, null=True, blank=True,
        db_column='roomId', related_name='devices',
    )
    location   = models.CharField(max_length=200, blank=True, default='')
    status     = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OFFLINE)
    last_seen  = models.DateTimeField(null=True, blank=True)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'iot_devices'
        indexes  = [models.Index(fields=['farm'], name='device_farm_idx')]
        constraints = [models.CheckConstraint(condition=models.Q(status__in=['online', 'offline', 'error']), name='device_status_valid')]

    def __str__(self):
        return f'{self.name} [{self.status}]'


class SensorReading(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    # Only readings made before rooms have a batch. A reading belongs to the room it was taken in, and the readings
    # of a batch are those of the rooms it stayed in. See sensors/room_readings.py.
    batch = models.ForeignKey(
        'batches.Batch',
        on_delete=models.CASCADE,
        null=True, blank=True,
        db_column='batchId',
        related_name='sensor_readings',
    )
    room = models.ForeignKey(
        'farms.RearingRoom',
        on_delete=models.CASCADE,
        null=True, blank=True,
        db_column='roomId',
        related_name='readings',
    )
    device = models.ForeignKey(
        IoTDevice,
        on_delete=models.SET_NULL, null=True, blank=True,
        db_column='deviceId', related_name='readings',
    )
    temperature = models.FloatField()
    humidity = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sensor_readings'
        indexes = [
            models.Index(fields=['batch'], name='sensor_batch_idx'),
            models.Index(fields=['room', 'timestamp'], name='sensor_room_time_idx'),
            models.Index(fields=['timestamp'], name='sensor_timestamp_idx'),
            # The newest reading of a device is the first row of this index (sensors/views.py: newest_readings_query).
            models.Index(fields=['device', '-timestamp'], name='sensor_device_time_idx'),
            # The old readings that know only their batch (and the batch's own readings by time).
            models.Index(fields=['batch', 'timestamp'], name='sensor_batch_time_idx'),
        ]
        constraints = [
            # What a DHT22 can report, the widest range the API takes (sensors/serializers.py).
            models.CheckConstraint(condition=models.Q(temperature__gte=-40, temperature__lte=85), name='reading_temperature_range'),
            models.CheckConstraint(condition=models.Q(humidity__gte=0, humidity__lte=100), name='reading_humidity_range'),
        ]

    def __str__(self):
        return f'Reading {self.id}: {self.temperature}°C / {self.humidity}%'


class SensorReadingHourly(models.Model):
    """What the readings of one room said in one complete hour: how many, and the lowest, average and highest of each.

    Written by `sensors.rollups.roll_up`. Raw readings are removed once they are old and their hour is here, and a long chart reads
    these rows (sensors/rollups.py has the rules). The hour is the start of the hour, in UTC.
    """
    id = models.BigAutoField(primary_key=True)
    room = models.ForeignKey('farms.RearingRoom', on_delete=models.CASCADE, db_column='roomId', related_name='hourly_readings')
    hour = models.DateTimeField()
    count = models.PositiveIntegerField()
    temp_min = models.FloatField(db_column='tempMin')
    temp_avg = models.FloatField(db_column='tempAvg')
    temp_max = models.FloatField(db_column='tempMax')
    hum_min = models.FloatField(db_column='humMin')
    hum_avg = models.FloatField(db_column='humAvg')
    hum_max = models.FloatField(db_column='humMax')

    class Meta:
        db_table = 'sensor_readings_hourly'
        constraints = [
            models.UniqueConstraint(fields=['room', 'hour'], name='sensor_hourly_room_hour_uniq'),
            models.CheckConstraint(condition=models.Q(count__gte=1), name='hourly_count_positive'),
            models.CheckConstraint(
                condition=models.Q(temp_min__lte=models.F('temp_max'), hum_min__lte=models.F('hum_max')), name='hourly_low_below_high',
            ),
        ]
        indexes = [models.Index(fields=['hour'], name='sensor_hourly_hour_idx')]

    def __str__(self):
        return f'{self.room_id} {self.hour:%Y-%m-%d %H}h: {self.count} readings'


class Disease(models.Model):
    """A result the disease check can give. `code` is the word the check, the screens and the reports already use."""
    code = models.CharField(primary_key=True, max_length=30)
    name = models.CharField(max_length=60)
    is_healthy = models.BooleanField(default=False, db_column='isHealthy')

    class Meta:
        db_table = 'diseases'
        ordering = ['code']

    def __str__(self):
        return self.name


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
    # The row of the lookup that `result` names, set on checks made since the lookup. Older checks are linked by a migration, and a
    # result the lookup does not know stays empty. `result` stays as it was, because reports, alerts and the screens read it.
    disease = models.ForeignKey(Disease, null=True, blank=True, on_delete=models.PROTECT, db_column='diseaseCode', related_name='detections')
    # Which version of the model gave the result, as the AI service reports it. Empty when it did not say.
    model_version = models.CharField(max_length=60, blank=True, default='', db_column='modelVersion')
    # Every score the model gave for the photo, by disease code. The result is the highest of them.
    probabilities = models.JSONField(default=dict, blank=True)
    confidence = models.FloatField()
    detected_at = models.DateTimeField(db_column='detectedAt', auto_now_add=True)
    notes = models.TextField(null=True, blank=True)
    # What the farmer said about the result. Empty until they answer. The answers show how the check does on real photos.
    is_correct = models.BooleanField(db_column='isCorrect', null=True, blank=True)
    actual_result = models.CharField(db_column='actualResult', max_length=20, null=True, blank=True)
    feedback_at = models.DateTimeField(db_column='feedbackAt', null=True, blank=True)

    class Meta:
        db_table = 'disease_detections'
        indexes = [
            models.Index(fields=['batch'], name='disease_batch_idx'),
        ]
        constraints = [models.CheckConstraint(condition=models.Q(confidence__gte=0, confidence__lte=1), name='detection_confidence_range')]

    def __str__(self):
        return f'{self.result} ({self.confidence:.0%})'
