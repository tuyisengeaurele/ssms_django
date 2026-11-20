from django.contrib.postgres.operations import AddIndexConcurrently
from django.db import migrations, models


class Migration(migrations.Migration):
    """An index on the batch and the time, built without locking writes.

    CREATE INDEX CONCURRENTLY cannot run inside a transaction, so this migration is not atomic. On a table of millions of readings a
    plain index would stop devices writing for the whole build. It is its own migration so a failed build leaves the table work in 0007
    done, and running `migrate` again finishes it (an interrupted concurrent build leaves an invalid index: drop it, then migrate).
    """

    atomic = False

    dependencies = [('sensors', '0007_sensor_readings_hourly')]

    operations = [
        AddIndexConcurrently(
            model_name='sensorreading',
            index=models.Index(fields=['batch', 'timestamp'], name='sensor_batch_time_idx'),
        ),
    ]
