from django.db import migrations, models

# The results the app knows. Healthy and Grasserie are what the model gives today; the others are the diseases the guidance on the
# screens covers, so a later model can name them without a migration.
DISEASES = [
    ('Healthy', 'Healthy', True),
    ('Grasserie', 'Grasserie', False),
    ('Flacherie', 'Flacherie', False),
    ('Muscardine', 'Muscardine', False),
    ('Pebrine', 'Pebrine', False),
]


def seed(apps, schema_editor):
    Disease = apps.get_model('sensors', 'Disease')
    for code, name, healthy in DISEASES:
        Disease.objects.update_or_create(code=code, defaults={'name': name, 'is_healthy': healthy})


class Migration(migrations.Migration):
    dependencies = [('sensors', '0011_devices_keep_the_room_only')]

    operations = [
        migrations.CreateModel(
            name='Disease',
            fields=[
                ('code', models.CharField(max_length=30, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=60)),
                ('is_healthy', models.BooleanField(db_column='isHealthy', default=False)),
            ],
            options={'db_table': 'diseases', 'ordering': ['code']},
        ),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
