from django.db import migrations
from django.db.models import F

STAGES = ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST']


def seed(apps, schema_editor):
    """Every stage starts with the range the system always used: 22 to 28 C and 70 to 85 %."""
    StageThreshold = apps.get_model('alerts', 'StageThreshold')
    for stage in STAGES:
        StageThreshold.objects.get_or_create(stage=stage)

    # Alerts that exist today are history. If they stayed open they would hide the next real problem of their batch.
    AlertLog = apps.get_model('alerts', 'AlertLog')
    AlertLog.objects.filter(type__in=['TEMPERATURE', 'HUMIDITY'], resolved_at__isnull=True).update(resolved_at=F('created_at'))


def unseed(apps, schema_editor):
    apps.get_model('alerts', 'StageThreshold').objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [('alerts', '0002_stage_thresholds_and_resolved_alerts')]
    operations = [migrations.RunPython(seed, unseed)]
