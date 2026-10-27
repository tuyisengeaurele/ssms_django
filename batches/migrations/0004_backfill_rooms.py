from django.db import migrations

from farms.room_backfill import backfill


def run(apps, schema_editor):
    backfill(apps)


class Migration(migrations.Migration):
    dependencies = [('batches', '0003_batch_room_batchroomstay')]
    # Going back needs nothing: the rooms and stays are simply dropped with their tables.
    operations = [migrations.RunPython(run, migrations.RunPython.noop)]
