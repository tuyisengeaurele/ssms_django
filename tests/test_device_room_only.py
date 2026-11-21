"""A device belongs to a farm and measures one room. The old link from a device to one batch is gone.

Since rooms, every batch in a room shares the room's air, so a device names a room and never a batch. The column was no longer
written or read, apart from a migration that gave older devices their room.
"""
import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from farms.models import RearingRoom
from sensors.models import IoTDevice
from tests.factories import FarmFactory, IoTDeviceFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_a_device_has_no_batch_field():
    assert 'batch' not in {field.name for field in IoTDevice._meta.get_fields()}


def test_a_batch_no_longer_lists_devices():
    from batches.models import Batch
    assert not hasattr(Batch, 'devices')


def test_a_device_answers_with_its_farm_and_room_and_no_batch(auth_client):
    farm = FarmFactory()
    room = RearingRoom.objects.create(farm=farm, name='North')
    device = IoTDeviceFactory(farm=farm, room=room)
    client = auth_client(UserFactory(role='ADMIN'))
    for url in ('/api/devices', f'/api/devices/{device.pk}'):
        body = client.get(url).json()['data']
        row = body[0] if isinstance(body, list) else body
        assert row['farmId'] == farm.pk and row['room'] == {'id': room.pk, 'name': 'North'}
        assert 'batchId' not in row


@pytest.mark.django_db(transaction=True)
def test_the_migration_gives_a_device_that_only_knew_a_batch_the_room_of_that_batch():
    """Run the real migrations back to before the column went, make an old style device, and migrate forward again."""
    before = [('sensors', '0009_data_constraints')]
    after = [('sensors', '0011_devices_keep_the_room_only')]
    executor = MigrationExecutor(connection)
    executor.migrate(after)
    executor.loader.build_graph()
    executor.migrate(before)
    old = executor.loader.project_state(before).apps
    Farm, Room, Batch, Device = (old.get_model(*name) for name in (('farms', 'Farm'), ('farms', 'RearingRoom'), ('batches', 'Batch'), ('sensors', 'IoTDevice')))
    from django.utils import timezone
    owner = UserFactory()
    farm = Farm.objects.create(name='Old farm', location='Gatsibo', owner_id=owner.pk)
    room = Room.objects.create(farm=farm, name='Room 1')
    batch = Batch.objects.create(farm=farm, room=room, stage='EGG', expected_harvest_date=timezone.now())
    device = Device.objects.create(name='old', device_key='ssms-old-device-key', farm=farm, batch=batch)
    try:
        executor = MigrationExecutor(connection)
        executor.migrate(after)
        placed = IoTDevice.objects.get(pk=device.pk)
        assert placed.room_id == room.pk
    finally:
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
