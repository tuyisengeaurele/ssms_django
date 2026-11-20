from django.db import migrations

from alerts.code_backfill import backfill


def run(apps, schema_editor):
    backfill(apps)


class Migration(migrations.Migration):
    dependencies = [('alerts', '0008_alert_code_and_params')]
    # Going back needs nothing: the sentence is still in `message`, and the new columns are dropped by 0008.
    operations = [migrations.RunPython(run, migrations.RunPython.noop)]
