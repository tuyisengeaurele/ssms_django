import django.db.models.deletion
from django.db import migrations, models


def link_old_checks(apps, schema_editor):
    """Point each old check at the disease its `result` names. A result the lookup does not know stays empty. Safe to run again."""
    Disease = apps.get_model('sensors', 'Disease')
    Check = apps.get_model('sensors', 'DiseaseDetection')
    for code in Disease.objects.values_list('code', flat=True):
        Check.objects.filter(disease__isnull=True, result=code).update(disease_id=code)


class Migration(migrations.Migration):
    dependencies = [('sensors', '0012_diseases')]

    operations = [
        migrations.AddField(
            model_name='diseasedetection', name='model_version',
            field=models.CharField(blank=True, db_column='modelVersion', default='', max_length=60),
        ),
        migrations.AddField(
            model_name='diseasedetection', name='probabilities',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='diseasedetection', name='disease',
            field=models.ForeignKey(
                blank=True, db_column='diseaseCode', null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='detections', to='sensors.disease',
            ),
        ),
        migrations.RunPython(link_old_checks, migrations.RunPython.noop),
    ]
