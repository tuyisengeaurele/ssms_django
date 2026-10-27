"""A small world with every kind of person and record the access rules have to tell apart."""
from datetime import timedelta
from types import SimpleNamespace

from django.utils import timezone

from batches.placement import place_batch
from farms.models import RearingRoom
from sensors.models import SensorReading
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    CooperativeFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    HarvestRecordFactory,
    IoTDeviceFactory,
    SensorReadingFactory,
    UserFactory,
)

# Who can see whose farm. Admin sees every active one.
SCOPE = {
    'farmer_owner': ['owner'],
    'farmer_peer': ['peer'],
    'farmer_foreign': ['foreign'],
    'farmer_no_coop': ['nocoop'],
    'supervisor_a': ['owner', 'peer'],
    'supervisor_b': ['foreign'],
    'supervisor_no_coop': [],
    'admin': ['owner', 'peer', 'foreign', 'nocoop'],
}
ACTORS = [*SCOPE, 'inactive_farmer', 'anonymous']
FARMERS = ['farmer_owner', 'farmer_peer', 'farmer_foreign', 'farmer_no_coop']
SUPERVISORS = ['supervisor_a', 'supervisor_b', 'supervisor_no_coop']

# One reading per farm, each with its own temperature so averages show exactly what was counted.
TEMPERATURES = {'owner': 24.0, 'peer': 26.0, 'foreign': 28.0, 'nocoop': 30.0}
DEAD_TEMPERATURE = 40.0


def _records(batch, *, temperature, farm=None):
    return SimpleNamespace(
        reading=SensorReadingFactory(batch=batch, temperature=temperature),
        detection=DiseaseDetectionFactory(batch=batch),
        alert=AlertLogFactory(batch=batch),
        harvest=HarvestRecordFactory(batch=batch),
        device=IoTDeviceFactory(farm=farm or batch.farm, batch=batch) if farm is not False else None,
    )


def build_world():
    coop_a = CooperativeFactory(name='Coop A')
    coop_b = CooperativeFactory(name='Coop B')

    users = {
        'farmer_owner': UserFactory(name='Owner', cooperative=coop_a),
        'farmer_peer': UserFactory(name='Peer', cooperative=coop_a),
        'farmer_foreign': UserFactory(name='Foreign', cooperative=coop_b),
        'farmer_no_coop': UserFactory(name='Loner'),
        'supervisor_a': UserFactory(name='Sup A', role='SUPERVISOR', cooperative=coop_a),
        'supervisor_b': UserFactory(name='Sup B', role='SUPERVISOR', cooperative=coop_b),
        'supervisor_no_coop': UserFactory(name='Sup None', role='SUPERVISOR'),
        'admin': UserFactory(name='Admin', role='ADMIN'),
        'inactive_farmer': UserFactory(name='Gone', cooperative=coop_a, is_active=False),
    }

    tenants = {}
    for key, actor in [('owner', 'farmer_owner'), ('peer', 'farmer_peer'),
                       ('foreign', 'farmer_foreign'), ('nocoop', 'farmer_no_coop')]:
        farm = FarmFactory(owner=users[actor], name=f'Farm {key}')
        batch = BatchFactory(farm=farm)
        records = _records(batch, temperature=TEMPERATURES[key])
        tenants[key] = SimpleNamespace(owner=users[actor], farm=farm, batch=batch, **vars(records))

    own = tenants['owner']
    # The owner's farm has two rooms, with the batch in the first.
    room_1 = RearingRoom.objects.create(farm=own.farm, name='Room 1')
    room_2 = RearingRoom.objects.create(farm=own.farm, name='Room 2')
    place_batch(own.batch, room_1)
    dead_batch = BatchFactory(farm=own.farm, is_active=False)
    # A device belongs to its farm, so the deleted batch gets none of its own.
    dead_batch_records = _records(dead_batch, temperature=DEAD_TEMPERATURE, farm=False)

    dead_farm = FarmFactory(owner=users['farmer_owner'], name='Farm gone', is_active=False)
    dead_farm_batch = BatchFactory(farm=dead_farm)
    dead_farm_records = _records(dead_farm_batch, temperature=DEAD_TEMPERATURE)

    # Put every reading in the same hour, a little in the past, so chart averages are exact.
    hour = timezone.now().replace(minute=15, second=0, microsecond=0) - timedelta(hours=2)
    SensorReading.objects.update(timestamp=hour)

    return SimpleNamespace(
        users=users, coop_a=coop_a, coop_b=coop_b, tenants=tenants,
        # The owner's records, because most rows are about them.
        farm=own.farm, batch=own.batch, reading=own.reading, detection=own.detection,
        alert=own.alert, harvest=own.harvest, device=own.device,
        room_1=room_1, room_2=room_2,
        dead_batch=dead_batch, dead_batch_records=dead_batch_records,
        dead_farm=dead_farm, dead_farm_batch=dead_farm_batch, dead_farm_records=dead_farm_records,
    )
