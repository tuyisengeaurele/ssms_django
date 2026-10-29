"""
List saved disease checks whose result the check can no longer give.

    python manage.py list_old_detection_names

Before the check was limited to silkworms, its answers were named with a class list that did not match the model.
A saved "Flacherie", "Muscardine" or "Pebrine" came from a leaf photo or a mislabelled output, so it is not a finding
about a silkworm. This command only counts them, and the alerts that name them, so the owner can decide what to do.
It changes nothing.
"""
from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from alerts.models import AlertLog
from sensors.detection_views import SILKWORM_RESULTS
from sensors.models import DiseaseDetection

# The names the page used to show for a disease. Alerts say them in their first words.
OLD_DISEASES = ('Flacherie', 'Muscardine', 'Pebrine')


class Command(BaseCommand):
    help = 'List saved disease checks, and disease alerts, that name something the check can no longer give. Read only.'

    def handle(self, *args, **options):
        old = (
            DiseaseDetection.objects.exclude(result__in=SILKWORM_RESULTS)
            .values('result').annotate(n=Count('id')).order_by('-n', 'result')
        )
        alerts = AlertLog.objects.filter(type='DISEASE').filter(
            Q(*[Q(message__startswith=name) for name in OLD_DISEASES], _connector=Q.OR),
        ).count()

        if not old and not alerts:
            self.stdout.write('Every saved result is one the check can give. Nothing to do.')
            return

        self.stdout.write('Saved results the check can no longer give:')
        for row in old:
            self.stdout.write(f'  {row["result"]}: {row["n"]}')
        self.stdout.write(f'Disease alerts naming an old disease: {alerts}')
        self.stdout.write('Nothing was changed.')
