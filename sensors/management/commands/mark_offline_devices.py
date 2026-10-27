"""Mark devices that have gone quiet as offline and alert the batch. Run it every few minutes from a scheduler.

    python manage.py mark_offline_devices
"""
from django.core.management.base import BaseCommand

from sensors.devices import mark_offline_devices


class Command(BaseCommand):
    help = 'Mark devices that have not sent data recently as offline, and open one alert per outage.'

    def handle(self, *args, **options):
        changed = mark_offline_devices()
        self.stdout.write(f'Marked {len(changed)} device(s) offline.')
