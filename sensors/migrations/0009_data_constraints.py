from django.db import migrations, models


def not_valid_then_validate(name, condition_sql, constraint):
    """Add a CHECK to sensor_readings without holding the table locked while every row is read.

    `NOT VALID` takes the lock for an instant and only checks new writes. `VALIDATE CONSTRAINT` then reads the old rows while writes
    continue. Each statement is its own transaction (the migration is not atomic), so the first lock is released before the scan.
    """
    return [
        migrations.RunSQL(
            sql=f'ALTER TABLE sensor_readings ADD CONSTRAINT {name} CHECK ({condition_sql}) NOT VALID;',
            reverse_sql=f'ALTER TABLE sensor_readings DROP CONSTRAINT IF EXISTS {name};',
            state_operations=[migrations.AddConstraint(model_name='sensorreading', constraint=constraint)],
        ),
        migrations.RunSQL(sql=f'ALTER TABLE sensor_readings VALIDATE CONSTRAINT {name};', reverse_sql=migrations.RunSQL.noop),
    ]


class Migration(migrations.Migration):
    """CHECK constraints for devices, disease checks, hourly summaries and readings.

    Not atomic so the readings table (the large one) can be validated without a long lock. If it stops half way, run `migrate` again:
    the constraint added NOT VALID stays, and `ALTER TABLE sensor_readings VALIDATE CONSTRAINT <name>` finishes it by hand.
    """

    atomic = False

    dependencies = [
        ('batches', '0006_data_constraints'),
        ('farms', '0006_data_constraints'),
        ('sensors', '0008_sensor_batch_time_idx'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='diseasedetection',
            constraint=models.CheckConstraint(condition=models.Q(('confidence__gte', 0), ('confidence__lte', 1)), name='detection_confidence_range'),
        ),
        migrations.AddConstraint(
            model_name='iotdevice',
            constraint=models.CheckConstraint(condition=models.Q(('status__in', ['online', 'offline', 'error'])), name='device_status_valid'),
        ),
        *not_valid_then_validate(
            'reading_temperature_range', '"temperature" >= -40 AND "temperature" <= 85',
            models.CheckConstraint(condition=models.Q(('temperature__gte', -40), ('temperature__lte', 85)), name='reading_temperature_range'),
        ),
        *not_valid_then_validate(
            'reading_humidity_range', '"humidity" >= 0 AND "humidity" <= 100',
            models.CheckConstraint(condition=models.Q(('humidity__gte', 0), ('humidity__lte', 100)), name='reading_humidity_range'),
        ),
        migrations.AddConstraint(
            model_name='sensorreadinghourly',
            constraint=models.CheckConstraint(condition=models.Q(('count__gte', 1)), name='hourly_count_positive'),
        ),
        migrations.AddConstraint(
            model_name='sensorreadinghourly',
            constraint=models.CheckConstraint(
                condition=models.Q(('hum_min__lte', models.F('hum_max')), ('temp_min__lte', models.F('temp_max'))), name='hourly_low_below_high',
            ),
        ),
    ]
