"""
Simulate IoT sensor devices, for a demo or for development.

Every room that holds a running batch gets a device, and the readings go through the same code a real device uses,
so status, last seen and alerts behave exactly as they will with hardware. The batches in a room share its readings.

    python manage.py simulate_sensors                       # one round
    python manage.py simulate_sensors --loop                # a round every 5 minutes, until Ctrl+C
    python manage.py simulate_sensors --loop --interval 30  # a round every 30 seconds
    python manage.py simulate_sensors --rounds 10 --interval 1
    python manage.py simulate_sensors --room <room id>      # only one room
    python manage.py simulate_sensors --batch <batch id>    # only the room of one batch

Stage a problem for a live demo, and go back to normal to watch the alert resolve:

    python manage.py simulate_sensors --scenario cold       # too cold, opens one temperature alert
    python manage.py simulate_sensors --scenario normal
"""
import math
import random
import time
import zlib
from datetime import datetime

from django.core.management.base import BaseCommand

from farms.models import RearingRoom
from sensors.devices import record_device_reading
from sensors.models import IoTDevice

SENSOR_TYPES = ['DHT22', 'AM2301', 'SHT31']
SCENARIOS = ['normal', 'cold', 'hot', 'humid', 'dry']


def reading_for(scenario: str, rng: random.Random, hour: int) -> tuple[float, float]:
    """A temperature and a humidity. Normal values stay inside the safe range, so a quiet demo stays quiet."""
    wave = math.sin(2 * math.pi * (hour - 9) / 24)
    temperature = 25.0 + 1.5 * wave + max(-0.8, min(0.8, rng.gauss(0, 0.4)))
    humidity = 77.0 - 3.0 * wave + max(-2.4, min(2.4, rng.gauss(0, 1.2)))
    if scenario == 'cold':
        temperature = rng.uniform(18.5, 20.5)
    elif scenario == 'hot':
        temperature = rng.uniform(30.0, 32.0)
    elif scenario == 'humid':
        humidity = rng.uniform(88.0, 92.0)
    elif scenario == 'dry':
        humidity = rng.uniform(55.0, 62.0)
    return round(temperature, 1), round(humidity, 1)


def device_key(room_id: str) -> str:
    return f'ssms-dev-{room_id[-12:]}'


def device_name(room) -> str:
    farm_slug = room.farm.name[:10].replace(' ', '-').upper()
    # crc32 and not hash(), because hash() of a string changes every time Python starts.
    return f'{SENSOR_TYPES[zlib.crc32(room.id.encode()) % len(SENSOR_TYPES)]}-{farm_slug}'


class Command(BaseCommand):
    help = 'Simulate IoT sensor devices for all active batches, through the same path real devices use.'

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true', help='Keep running a round every --interval seconds.')
        parser.add_argument('--rounds', type=int, default=None, help='Run this many rounds and stop.')
        parser.add_argument('--interval', type=int, default=300, metavar='SECONDS', help='Seconds between rounds (default 300).')
        parser.add_argument('--room', default=None, metavar='ROOM_ID', help='Only this room.')
        parser.add_argument('--batch', default=None, metavar='BATCH_ID', help='Only the room this batch is in.')
        parser.add_argument('--scenario', choices=SCENARIOS, default='normal', help='Stage a problem: cold, hot, humid or dry.')

    def handle(self, *args, **options):
        interval, scenario = options['interval'], options['scenario']
        room_id, batch_id = options['room'], options['batch']
        rng = random.Random()

        if options['rounds'] is not None:
            for number in range(options['rounds']):
                self._round(rng, scenario, room_id, batch_id)
                if number < options['rounds'] - 1:
                    time.sleep(interval)
        elif options['loop']:
            self.stdout.write(f'Running a round every {interval} s ({scenario}). Press Ctrl+C to stop.')
            try:
                while True:
                    self._round(rng, scenario, room_id, batch_id)
                    time.sleep(interval)
            except KeyboardInterrupt:
                self.stdout.write(self.style.WARNING('Stopped.'))
        else:
            self._round(rng, scenario, room_id, batch_id)

    def _round(self, rng, scenario, room_id=None, batch_id=None):
        rooms = (
            RearingRoom.objects.select_related('farm')
            .filter(is_active=True, farm__is_active=True, batches__is_active=True)
            .distinct()
        )
        if room_id:
            rooms = rooms.filter(pk=room_id)
        if batch_id:
            rooms = rooms.filter(batches__pk=batch_id)
        rooms = list(rooms)
        if not rooms:
            self.stdout.write(self.style.WARNING('No room with a running batch, so nothing was sent.'))
            return

        self.stdout.write(f'\n{datetime.now():%Y-%m-%d %H:%M:%S}  {len(rooms)} room(s), scenario {scenario}')
        for room in rooms:
            device, _ = IoTDevice.objects.update_or_create(
                device_key=device_key(room.id),
                defaults={
                    'name': device_name(room),
                    'farm': room.farm,
                    'room': room,
                    'location': f'{room.farm.location} / {room.name}',
                    'is_active': True,
                },
            )
            temperature, humidity = reading_for(scenario, rng, datetime.now().hour)
            record_device_reading(device, room, temperature, humidity)
            self.stdout.write(f'  {room.name:<16} {device.name:<24} {temperature:>5.1f} C  {humidity:>5.1f} %')
