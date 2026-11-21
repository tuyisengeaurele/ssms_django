import django.db.models.deletion
from django.db import migrations, models

import core.ids


def backfill_memberships(apps, schema_editor):
    """Open a membership for everyone who is in a cooperative and has none, starting when their account was made.

    Nobody's real joining date was kept, so the account's creation is the earliest honest start. Safe to run again.
    """
    User = apps.get_model('users', 'User')
    Membership = apps.get_model('cooperatives', 'CooperativeMembership')
    has_one = set(Membership.objects.filter(ended_at__isnull=True).values_list('user_id', flat=True))
    rows = [
        Membership(user_id=pk, cooperative_id=coop_id, started_at=created)
        for pk, coop_id, created in User.objects.filter(cooperative__isnull=False).values_list('pk', 'cooperative_id', 'created_at')
        if pk not in has_one
    ]
    Membership.objects.bulk_create(rows, batch_size=1000)


class Migration(migrations.Migration):
    dependencies = [
        ('cooperatives', '0003_invitation_starter_boxes'),
        ('users', '0013_notification_preferences'),
    ]

    operations = [
        migrations.CreateModel(
            name='CooperativeMembership',
            fields=[
                ('id', models.CharField(default=core.ids.new_id, editable=False, max_length=36, primary_key=True, serialize=False)),
                ('started_at', models.DateTimeField(db_column='startedAt')),
                ('ended_at', models.DateTimeField(blank=True, db_column='endedAt', null=True)),
                ('cooperative', models.ForeignKey(db_column='cooperativeId', on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='cooperatives.cooperative')),
                ('user', models.ForeignKey(db_column='userId', on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='users.user')),
            ],
            options={'db_table': 'cooperative_memberships', 'ordering': ['started_at']},
        ),
        migrations.AddIndex(
            model_name='cooperativemembership',
            index=models.Index(fields=['cooperative', 'ended_at'], name='membership_coop_open_idx'),
        ),
        migrations.AddConstraint(
            model_name='cooperativemembership',
            constraint=models.UniqueConstraint(condition=models.Q(('ended_at__isnull', True)), fields=('user',), name='membership_one_open_per_user'),
        ),
        migrations.AddConstraint(
            model_name='cooperativemembership',
            constraint=models.CheckConstraint(
                condition=models.Q(('ended_at__isnull', True), ('ended_at__gte', models.F('started_at')), _connector='OR'),
                name='membership_ends_after_start',
            ),
        ),
        migrations.RunPython(backfill_memberships, migrations.RunPython.noop),
    ]
