from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name='ContactMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name',       models.CharField(max_length=120)),
                ('email',      models.EmailField(max_length=254)),
                ('subject',    models.CharField(max_length=200)),
                ('message',    models.TextField()),
                ('is_read',    models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'db_table': 'contact_messages', 'ordering': ['-created_at']},
        ),
    ]
