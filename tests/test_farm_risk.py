"""Farm risk ranking for supervisors: which farms need a look first, and why.

The rule is plain on purpose, so a supervisor can say it back to a farmer:
* HIGH: a disease alert in the last 14 days, or a temperature or humidity problem that is still open.
* MEDIUM: a sensor that is offline.
* OK: none of those.
Within a level the farm with more trouble comes first.
"""
from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from alerts.models import AlertLog
from batches.placement import place_batch
from farms.models import RearingRoom
from sensors.models import IoTDevice
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    CooperativeFactory,
    FarmFactory,
    IoTDeviceFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

URL = '/api/farms/risk'


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Mukamana')


@pytest.fixture
def owner(coop):
    return UserFactory(role='FARMER', cooperative=coop, name='Mugisha Serge')


def farm_of(owner, name='Hill Farm'):
    return FarmFactory(owner=owner, name=name)


def ranking(client):
    response = client.get(URL)
    assert response.status_code == 200, response.content[:200]
    return response.json()['data']


def by_name(rows, name):
    return next(r for r in rows if r['name'] == name)


def open_air_alert(farm, kind='TEMPERATURE', resolved=False):
    room = RearingRoom.objects.create(farm=farm, name=f'Room {RearingRoom.objects.count()}')
    place_batch(BatchFactory(farm=farm, stage='PUPA'), room)
    return AlertLogFactory(batch=None, room=room, type=kind, message='x', resolved_at=timezone.now() if resolved else None)


def disease_alert(farm, days_ago=1):
    batch = BatchFactory(farm=farm)
    alert = AlertLogFactory(batch=batch, type='DISEASE', message='Pebrine suspected')
    AlertLog.objects.filter(pk=alert.pk).update(created_at=timezone.now() - timedelta(days=days_ago))
    return alert


def device(farm, status='offline', last_seen_minutes_ago=None, **over):
    last_seen = timezone.now() - timedelta(minutes=last_seen_minutes_ago) if last_seen_minutes_ago is not None else None
    return IoTDeviceFactory(farm=farm, status=status, last_seen=last_seen, **over)


# ── who may ask ─────────────────────────────────────────────────────────────

def test_a_supervisor_may_ask(auth_client, supervisor):
    assert auth_client(supervisor).get(URL).status_code == 200


def test_an_admin_may_ask(auth_client):
    assert auth_client(UserFactory(role='ADMIN')).get(URL).status_code == 200


def test_a_farmer_is_refused(auth_client, owner):
    assert auth_client(owner).get(URL).status_code == 403


def test_a_stranger_gets_nothing(api_client):
    assert api_client.get(URL).status_code == 401


def test_a_supervisor_sees_only_the_farms_of_the_cooperative(auth_client, supervisor, owner):
    farm_of(owner, 'Mine')
    farm_of(UserFactory(role='FARMER', cooperative=CooperativeFactory()), 'Someone else')
    assert [r['name'] for r in ranking(auth_client(supervisor))] == ['Mine']


def test_an_admin_sees_every_farm(auth_client, owner):
    farm_of(owner, 'Mine')
    farm_of(UserFactory(role='FARMER', cooperative=CooperativeFactory()), 'Someone else')
    names = {r['name'] for r in ranking(auth_client(UserFactory(role='ADMIN')))}
    assert names == {'Mine', 'Someone else'}


def test_a_deleted_farm_is_left_out(auth_client, supervisor, owner):
    gone = farm_of(owner, 'Gone')
    gone.is_active = False
    gone.save(update_fields=['is_active'])
    assert ranking(auth_client(supervisor)) == []


# ── the levels ──────────────────────────────────────────────────────────────

def test_a_farm_with_nothing_wrong_is_ok(auth_client, supervisor, owner):
    farm_of(owner)
    row = ranking(auth_client(supervisor))[0]
    assert row['level'] == 'OK'
    assert (row['openAirAlerts'], row['diseaseAlerts'], row['offlineDevices']) == (0, 0, 0)


@pytest.mark.parametrize('kind', ['TEMPERATURE', 'HUMIDITY'])
def test_an_open_air_problem_makes_a_farm_high(auth_client, supervisor, owner, kind):
    farm = farm_of(owner)
    open_air_alert(farm, kind)
    row = ranking(auth_client(supervisor))[0]
    assert row['level'] == 'HIGH' and row['openAirAlerts'] == 1


def test_an_air_problem_that_has_been_resolved_does_not_count(auth_client, supervisor, owner):
    farm = farm_of(owner)
    open_air_alert(farm, resolved=True)
    assert ranking(auth_client(supervisor))[0]['level'] == 'OK'


def test_a_read_air_alert_is_still_open_until_the_problem_ends(auth_client, supervisor, owner):
    farm = farm_of(owner)
    alert = open_air_alert(farm)
    AlertLog.objects.filter(pk=alert.pk).update(is_read=True)
    assert ranking(auth_client(supervisor))[0]['level'] == 'HIGH'


def test_a_disease_alert_in_the_last_fourteen_days_makes_a_farm_high(auth_client, supervisor, owner):
    farm = farm_of(owner)
    disease_alert(farm, days_ago=13)
    row = ranking(auth_client(supervisor))[0]
    assert row['level'] == 'HIGH' and row['diseaseAlerts'] == 1


def test_an_older_disease_alert_does_not_count(auth_client, supervisor, owner):
    farm = farm_of(owner)
    disease_alert(farm, days_ago=15)
    row = ranking(auth_client(supervisor))[0]
    assert row['level'] == 'OK' and row['diseaseAlerts'] == 0


def test_a_disease_alert_that_was_read_still_counts(auth_client, supervisor, owner):
    farm = farm_of(owner)
    alert = disease_alert(farm)
    AlertLog.objects.filter(pk=alert.pk).update(is_read=True)
    assert ranking(auth_client(supervisor))[0]['level'] == 'HIGH'


def test_an_offline_sensor_makes_a_farm_medium(auth_client, supervisor, owner):
    farm = farm_of(owner)
    device(farm, 'offline', last_seen_minutes_ago=600)
    row = ranking(auth_client(supervisor))[0]
    assert row['level'] == 'MEDIUM' and row['offlineDevices'] == 1


def test_a_sensor_that_says_online_but_has_been_quiet_is_offline(auth_client, supervisor, owner, settings):
    settings.DEVICE_OFFLINE_MINUTES = 30
    farm = farm_of(owner)
    device(farm, 'online', last_seen_minutes_ago=120)
    assert ranking(auth_client(supervisor))[0]['offlineDevices'] == 1


def test_a_sensor_that_reported_a_moment_ago_is_fine(auth_client, supervisor, owner, settings):
    settings.DEVICE_OFFLINE_MINUTES = 30
    farm = farm_of(owner)
    device(farm, 'online', last_seen_minutes_ago=2)
    assert ranking(auth_client(supervisor))[0]['offlineDevices'] == 0


def test_a_sensor_in_error_counts_as_trouble(auth_client, supervisor, owner):
    farm = farm_of(owner)
    device(farm, 'error', last_seen_minutes_ago=1)
    assert ranking(auth_client(supervisor))[0]['offlineDevices'] == 1


def test_a_sensor_that_was_switched_off_on_purpose_is_ignored(auth_client, supervisor, owner):
    farm = farm_of(owner)
    device(farm, 'offline', is_active=False)
    assert ranking(auth_client(supervisor))[0]['offlineDevices'] == 0


def test_high_beats_medium_on_one_farm(auth_client, supervisor, owner):
    farm = farm_of(owner)
    device(farm, 'offline')
    disease_alert(farm)
    row = ranking(auth_client(supervisor))[0]
    assert row['level'] == 'HIGH' and row['offlineDevices'] == 1 and row['diseaseAlerts'] == 1


# ── what is counted ─────────────────────────────────────────────────────────

def test_trouble_on_another_farm_is_not_counted(auth_client, supervisor, owner):
    quiet, loud = farm_of(owner, 'Quiet'), farm_of(owner, 'Loud')
    disease_alert(loud)
    rows = ranking(auth_client(supervisor))
    assert by_name(rows, 'Quiet')['level'] == 'OK' and by_name(rows, 'Loud')['level'] == 'HIGH'
    assert quiet.pk != loud.pk


def test_the_disease_alert_of_a_deleted_batch_is_not_counted(auth_client, supervisor, owner):
    farm = farm_of(owner)
    alert = disease_alert(farm)
    alert.batch.is_active = False
    alert.batch.save(update_fields=['is_active'])
    assert ranking(auth_client(supervisor))[0]['diseaseAlerts'] == 0


def test_an_air_alert_of_a_deleted_room_is_not_counted(auth_client, supervisor, owner):
    farm = farm_of(owner)
    alert = open_air_alert(farm)
    RearingRoom.objects.filter(pk=alert.room_id).update(is_active=False)
    assert ranking(auth_client(supervisor))[0]['openAirAlerts'] == 0


def test_other_alert_kinds_do_not_make_a_farm_high(auth_client, supervisor, owner):
    farm = farm_of(owner)
    AlertLogFactory(batch=BatchFactory(farm=farm), type='STAGE_CHANGE', message='x')
    assert ranking(auth_client(supervisor))[0]['level'] == 'OK'


def test_each_row_says_who_owns_the_farm_and_where_it_is(auth_client, supervisor, owner):
    FarmFactory(owner=owner, name='Hill Farm', location='Gatsibo District')
    row = ranking(auth_client(supervisor))[0]
    assert row['ownerName'] == 'Mugisha Serge' and row['location'] == 'Gatsibo District'
    assert row['id'] and row['activeBatches'] == 0


def test_the_active_batches_are_counted(auth_client, supervisor, owner):
    farm = farm_of(owner)
    BatchFactory(farm=farm)
    BatchFactory(farm=farm)
    BatchFactory(farm=farm, is_active=False)
    assert ranking(auth_client(supervisor))[0]['activeBatches'] == 2


# ── the order ───────────────────────────────────────────────────────────────

def test_high_comes_before_medium_before_ok(auth_client, supervisor, owner):
    ok, medium, high = farm_of(owner, 'A ok'), farm_of(owner, 'B medium'), farm_of(owner, 'C high')
    device(medium, 'offline')
    disease_alert(high)
    assert [r['name'] for r in ranking(auth_client(supervisor))] == ['C high', 'B medium', 'A ok']
    assert ok.pk


def test_within_a_level_more_trouble_comes_first(auth_client, supervisor, owner):
    one, two = farm_of(owner, 'A one problem'), farm_of(owner, 'B two problems')
    disease_alert(one)
    disease_alert(two)
    open_air_alert(two)
    assert [r['name'] for r in ranking(auth_client(supervisor))] == ['B two problems', 'A one problem']


def test_a_disease_weighs_more_than_an_air_problem(auth_client, supervisor, owner):
    air, disease = farm_of(owner, 'A air'), farm_of(owner, 'B disease')
    open_air_alert(air)
    disease_alert(disease)
    assert [r['name'] for r in ranking(auth_client(supervisor))] == ['B disease', 'A air']


def test_farms_with_the_same_trouble_are_in_name_order(auth_client, supervisor, owner):
    for name in ('Zebra', 'apple', 'Mango'):
        farm_of(owner, name)
    assert [r['name'] for r in ranking(auth_client(supervisor))] == ['apple', 'Mango', 'Zebra']


# ── cost ────────────────────────────────────────────────────────────────────

def test_the_number_of_queries_does_not_grow_with_the_number_of_farms(auth_client, supervisor, owner):
    def cost(client):
        with CaptureQueriesContext(connection) as queries:
            assert client.get(URL).status_code == 200
        return len(queries)

    client = auth_client(supervisor)
    farm = farm_of(owner, 'First')
    disease_alert(farm)
    device(farm)
    few = cost(client)
    for i in range(10):
        extra = farm_of(owner, f'Farm {i}')
        disease_alert(extra)
        open_air_alert(extra)
        device(extra)
    assert cost(client) == few
    assert IoTDevice.objects.count() == 11
