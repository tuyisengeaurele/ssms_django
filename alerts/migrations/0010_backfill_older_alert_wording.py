from django.db import migrations

from alerts.code_backfill import backfill


def run(apps, schema_editor):
    backfill(apps)


class Migration(migrations.Migration):
    dependencies = [('alerts', '0009_backfill_alert_codes')]
    # The same backfill again, now that it knows the wording of the first versions. It only touches alerts with no code.
    operations = [migrations.RunPython(run, migrations.RunPython.noop)]
