from django.db import migrations, models
import django.db.models.deletion
import sensors.models


class Migration(migrations.Migration):

    dependencies = [
        ('batches', '0001_initial'),
        ('farms',   '0001_initial'),
        ('sensors', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='IoTDevice',
            fields=[
                ('id',         models.CharField(default=sensors.models._generate_id, editable=False, max_length=36, primary_key=True, serialize=False)),
                ('name',       models.CharField(max_length=100)),
                ('device_key', models.CharField(max_length=80, unique=True)),
                ('location',   models.CharField(blank=True, default='', max_length=200)),
                ('status',     models.CharField(choices=[('online', 'Online'), ('offline', 'Offline'), ('error', 'Error')], default='offline', max_length=10)),
                ('last_seen',  models.DateTimeField(blank=True, null=True)),
                ('is_active',  models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('farm',  models.ForeignKey(blank=True, db_column='farmId',  null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='devices', to='farms.farm')),
                ('batch', models.ForeignKey(blank=True, db_column='batchId', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='devices', to='batches.batch')),
            ],
            options={'db_table': 'iot_devices'},
        ),
        migrations.AddIndex(
            model_name='iotdevice',
            index=models.Index(fields=['farm'], name='device_farm_idx'),
        ),
        migrations.AddField(
            model_name='sensorreading',
            name='device',
            field=models.ForeignKey(blank=True, db_column='deviceId', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='readings', to='sensors.iotdevice'),
        ),
    ]
