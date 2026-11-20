from django.db import migrations, models


class Migration(migrations.Migration):
    """An index on the device and the time, newest first, so the newest reading of a device is the first row of it.

    A plain index, not CONCURRENTLY: the table is small on the live site, so building it takes a moment and nothing waits on it.
    (A table of millions of rows would want CREATE INDEX CONCURRENTLY, which Django does through AddIndexConcurrently outside a
    transaction. That is the rollups task of phase 3.)
    """

    dependencies = [
        ('sensors', '0005_detection_feedback'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='sensorreading',
            index=models.Index(fields=['device', '-timestamp'], name='sensor_device_time_idx'),
        ),
    ]
