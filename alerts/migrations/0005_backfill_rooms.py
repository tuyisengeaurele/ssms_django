from django.db import migrations

from alerts.room_backfill import backfill


def run(apps, schema_editor):
    backfill(apps)


class Migration(migrations.Migration):
    dependencies = [
        ('alerts', '0004_alertlog_room'),
        ('batches', '0004_backfill_rooms'),
    ]
    operations = [migrations.RunPython(run, migrations.RunPython.noop)]
