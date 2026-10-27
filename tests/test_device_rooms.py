"""A device is put in a room when it is made, and can be moved to another room of its farm later."""
import pytest

from audit_log.models import AuditLog
from farms.models import RearingRoom
from sensors.models import IoTDevice
from tests.factories import CooperativeFactory, FarmFactory, IoTDeviceFactory, UserFactory

pytestmark = pytest.mark.django_db

CHOOSE = "Please choose one of this farm's rooms."


@pytest.fixture
def admin(auth_client):
    return auth_client(UserFactory(role='ADMIN'))


@pytest.fixture
def farm():
    return FarmFactory()


def make(client, farm, **body):
    return client.post('/api/devices', {'name': 'Shed sensor', 'farmId': farm.pk, **body}, format='json')


def room(farm, name):
    return RearingRoom.objects.create(farm=farm, name=name)


def test_a_device_is_made_in_the_room_that_was_chosen(admin, farm):
    room(farm, 'Room A')
    chosen = room(farm, 'Room B')
    response = make(admin, farm, roomId=chosen.pk)
    assert response.status_code == 201
    assert IoTDevice.objects.get().room_id == chosen.pk
    assert response.json()['data']['room'] == {'id': chosen.pk, 'name': 'Room B'}


def test_on_a_farm_with_one_room_the_device_goes_there_without_being_asked(admin, farm):
    only = room(farm, 'Only room')
    make(admin, farm)
    assert IoTDevice.objects.get().room_id == only.pk


@pytest.mark.parametrize('rooms', [0, 2])
def test_on_a_farm_with_no_room_or_several_the_device_waits_to_be_placed(admin, farm, rooms):
    for index in range(rooms):
        room(farm, f'Room {index}')
    assert make(admin, farm).status_code == 201
    assert IoTDevice.objects.get().room_id is None


def test_a_room_of_another_farm_or_a_deleted_room_is_refused(admin, farm):
    elsewhere = room(FarmFactory(), 'Elsewhere')
    gone = RearingRoom.objects.create(farm=farm, name='Old', is_active=False)
    for bad in (elsewhere, gone):
        response = make(admin, farm, roomId=bad.pk)
        assert response.status_code == 422
        assert response.json()['message'] == CHOOSE
    assert IoTDevice.objects.count() == 0


def test_a_device_can_be_moved_to_another_room_of_its_farm(admin, farm):
    a, b = room(farm, 'Room A'), room(farm, 'Room B')
    device = IoTDeviceFactory(farm=farm, room=a)
    response = admin.patch(f'/api/devices/{device.pk}', {'roomId': b.pk}, format='json')
    assert response.status_code == 200
    assert response.json()['message'] == 'Device moved.'
    device.refresh_from_db()
    assert device.room_id == b.pk
    assert AuditLog.objects.filter(action='UPDATE', resource='Device', detail__contains='Room B').exists()


def test_moving_a_device_to_a_room_of_another_farm_is_refused(admin, farm):
    a = room(farm, 'Room A')
    device = IoTDeviceFactory(farm=farm, room=a)
    response = admin.patch(f'/api/devices/{device.pk}', {'roomId': room(FarmFactory(), 'Elsewhere').pk}, format='json')
    assert response.status_code == 422
    device.refresh_from_db()
    assert device.room_id == a.pk


def test_a_room_is_needed_to_move_a_device(admin, farm):
    device = IoTDeviceFactory(farm=farm, room=room(farm, 'Room A'))
    assert admin.patch(f'/api/devices/{device.pk}', {}, format='json').status_code == 422


def test_a_supervisor_of_the_cooperative_can_move_a_device_but_the_farmer_cannot(auth_client):
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    farm = FarmFactory(owner=farmer)
    a, b = room(farm, 'Room A'), room(farm, 'Room B')
    device = IoTDeviceFactory(farm=farm, room=a)
    assert auth_client(farmer).patch(f'/api/devices/{device.pk}', {'roomId': b.pk}, format='json').status_code == 403
    assert auth_client(UserFactory(role='SUPERVISOR', cooperative=coop)).patch(f'/api/devices/{device.pk}', {'roomId': b.pk}, format='json').status_code == 200


def test_another_cooperatives_supervisor_cannot_find_the_device(auth_client, farm):
    a, b = room(farm, 'Room A'), room(farm, 'Room B')
    device = IoTDeviceFactory(farm=farm, room=a)
    stranger = auth_client(UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory()))
    assert stranger.patch(f'/api/devices/{device.pk}', {'roomId': b.pk}, format='json').status_code == 404


def test_signing_in_is_required_to_move_a_device(api_client, farm):
    device = IoTDeviceFactory(farm=farm, room=room(farm, 'Room A'))
    assert api_client.patch(f'/api/devices/{device.pk}', {'roomId': 'x'}, format='json').status_code == 401


def test_the_device_list_and_page_name_the_room(admin, farm):
    a = room(farm, 'Rearing house 1')
    device = IoTDeviceFactory(farm=farm, room=a)
    listed = {d['id']: d for d in admin.get('/api/devices').json()['data']}
    assert listed[device.pk]['room'] == {'id': a.pk, 'name': 'Rearing house 1'}
    assert admin.get(f'/api/devices/{device.pk}').json()['data']['room']['name'] == 'Rearing house 1'


def test_a_device_without_a_room_shows_none(admin, farm):
    device = IoTDeviceFactory(farm=farm, room=None)
    assert admin.get(f'/api/devices/{device.pk}').json()['data']['room'] is None
