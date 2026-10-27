import pytest
from rest_framework.exceptions import NotFound

from alerts.models import AlertLog
from core.access import (
    get_batch_or_404,
    get_farm_or_404,
    scope_alerts,
    scope_batches,
    scope_by_batch,
    scope_by_farm,
    scope_farms,
    scope_readings,
)
from farms.models import RearingRoom
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection, IoTDevice, SensorReading
from tests.factories import BatchFactory, FarmFactory, UserFactory
from tests.security.world import SCOPE

pytestmark = pytest.mark.django_db

PEOPLE = list(SCOPE)  # every signed in actor with data to see


def ids(qs):
    return {obj.pk for obj in qs}


def expected(world, actor, attr):
    return {getattr(world.tenants[key], attr).pk for key in SCOPE[actor]}


@pytest.mark.parametrize('actor', PEOPLE)
def test_scope_farms_matches_the_rules(world, actor):
    assert ids(scope_farms(world.users[actor])) == expected(world, actor, 'farm')


@pytest.mark.parametrize('actor', PEOPLE)
def test_scope_batches_matches_the_rules(world, actor):
    assert ids(scope_batches(world.users[actor])) == expected(world, actor, 'batch')


@pytest.mark.parametrize('model, attr', [
    (DiseaseDetection, 'detection'), (AlertLog, 'alert'), (HarvestRecord, 'harvest'),
])
@pytest.mark.parametrize('actor', PEOPLE)
def test_scope_by_batch_matches_the_rules(world, actor, model, attr):
    assert ids(scope_by_batch(world.users[actor], model.objects.all())) == expected(world, actor, attr)


@pytest.mark.parametrize('actor', PEOPLE)
def test_scope_alerts_matches_the_rules_for_alerts_of_a_batch_and_of_a_room(world, actor):
    assert ids(scope_alerts(world.users[actor], AlertLog.objects.all())) == expected(world, actor, 'alert') | expected(world, actor, 'room_alert')


@pytest.mark.parametrize('actor', ['admin', 'farmer_owner', 'supervisor_a'])
def test_a_deleted_farm_or_room_hides_its_alerts(world, actor):
    user = world.users[actor]
    seen = ids(scope_alerts(user, AlertLog.objects.all()))
    assert world.dead_farm_records.alert.pk not in seen
    assert world.dead_farm_records.room_alert.pk not in seen
    RearingRoom.objects.filter(pk=world.room_1.pk).update(is_active=False)
    assert world.tenants['owner'].room_alert.pk not in ids(scope_alerts(user, AlertLog.objects.all()))


@pytest.mark.parametrize('actor', PEOPLE)
def test_scope_readings_matches_the_rules(world, actor):
    assert ids(scope_readings(world.users[actor], SensorReading.objects.all())) == expected(world, actor, 'reading')


@pytest.mark.parametrize('actor', PEOPLE)
def test_scope_by_farm_matches_the_rules(world, actor):
    assert ids(scope_by_farm(world.users[actor], IoTDevice.objects.all())) == expected(world, actor, 'device')


def test_a_deleted_farm_and_its_batches_are_hidden_from_everyone_including_admin(world):
    admin = world.users['admin']
    assert world.dead_farm.pk not in ids(scope_farms(admin))
    assert world.dead_farm_batch.pk not in ids(scope_batches(admin))
    assert world.dead_batch.pk not in ids(scope_batches(admin))
    assert world.dead_farm_records.alert.pk not in ids(scope_by_batch(admin, AlertLog.objects.all()))
    assert world.dead_batch_records.reading.pk not in ids(scope_readings(admin, SensorReading.objects.all()))
    assert world.dead_farm_records.reading.pk not in ids(scope_readings(admin, SensorReading.objects.all()))
    assert world.dead_farm_records.device.pk not in ids(scope_by_farm(admin, IoTDevice.objects.all()))


def test_a_supervisor_never_sees_a_farm_owned_by_a_non_farmer_in_the_same_cooperative(world):
    boss = UserFactory(role='ADMIN', cooperative=world.coop_a)
    farm = FarmFactory(owner=boss)
    BatchFactory(farm=farm)
    sup = world.users['supervisor_a']
    assert farm.pk not in ids(scope_farms(sup))


def test_scope_helpers_narrow_an_existing_queryset(world):
    own = world.users['farmer_owner']
    narrowed = scope_farms(own, scope_farms(world.users['admin']).filter(name='Farm peer'))
    assert ids(narrowed) == set()


def test_get_farm_or_404_returns_the_farm_in_scope(world):
    assert get_farm_or_404(world.users['supervisor_a'], world.farm.pk) == world.farm


@pytest.mark.parametrize('actor', ['farmer_peer', 'farmer_foreign', 'farmer_no_coop', 'supervisor_b', 'supervisor_no_coop'])
def test_get_farm_or_404_hides_a_farm_out_of_scope(world, actor):
    with pytest.raises(NotFound):
        get_farm_or_404(world.users[actor], world.farm.pk)


def test_get_farm_or_404_hides_a_deleted_farm_even_from_admin(world):
    with pytest.raises(NotFound):
        get_farm_or_404(world.users['admin'], world.dead_farm.pk)


def test_get_batch_or_404_follows_the_same_rules(world):
    assert get_batch_or_404(world.users['admin'], world.batch.pk) == world.batch
    with pytest.raises(NotFound):
        get_batch_or_404(world.users['farmer_peer'], world.batch.pk)
    with pytest.raises(NotFound):
        get_batch_or_404(world.users['admin'], world.dead_batch.pk)
    with pytest.raises(NotFound):
        get_batch_or_404(world.users['admin'], world.dead_farm_batch.pk)


@pytest.mark.parametrize('bad_id', ['', 'x' * 500, 'nope', "' OR 1=1 --", 'éè'])
def test_odd_ids_are_simply_not_found(world, bad_id):
    with pytest.raises(NotFound):
        get_batch_or_404(world.users['admin'], bad_id)
    with pytest.raises(NotFound):
        get_farm_or_404(world.users['admin'], bad_id)
