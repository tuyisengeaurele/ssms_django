from django.db import migrations

from sensors.room_backfill import backfill


def run(apps, schema_editor):
    backfill(apps)


class Migration(migrations.Migration):
    dependencies = [
        ('sensors', '0003_rooms_for_devices_and_readings'),
        ('batches', '0004_backfill_rooms'),
    ]
    operations = [migrations.RunPython(run, migrations.RunPython.noop)]
