"""The script that fills a scratch database with load-sized data: where it may run, what it makes, and that the app can read it."""
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

import pytest

from alerts.models import AlertLog
from batches.models import Batch
from cooperatives.models import Cooperative
from farms.models import Farm
from scripts.seed_load_data import DOMAIN, NotAScratchDatabase, check_database_name, seed
from sensors.models import IoTDevice, SensorReading
from users.models import User

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 11, 19, 12, 0, tzinfo=dt_timezone.utc)
SMALL = {'farms': 6, 'batches_per_farm': 4, 'days': 2, 'cooperatives': 2, 'now': NOW, 'log': lambda text: None}


@pytest.mark.parametrize('name', ['ssms_db', 'postgres', 'production', 'ssms', 'SSMS_DB'])
def test_it_refuses_a_database_that_does_not_say_it_is_a_scratch_one(name):
    with pytest.raises(NotAScratchDatabase):
        check_database_name(name)


@pytest.mark.parametrize('name', ['ssms_load', 'ssms_scratch_rooms', 'ssms_measure', 'test_ssms_db', 'SSMS_LOAD'])
def test_it_accepts_a_scratch_database(name):
    check_database_name(name)


def test_it_makes_the_counts_it_was_asked_for():
    counts = seed(**SMALL)
    assert counts['farms'] == 6
    assert counts['rooms'] == 12 and counts['devices'] == 12
    assert counts['batches'] == 24
    assert counts['readings'] == 12 * (2 * 24 + 1)
    assert counts['harvests'] == 12          # 2 of the 4 batches of each farm are harvested
    assert counts['detections'] == 6 * (2 * 2 + 2 * 1)
    assert counts['staff'] == 3              # a supervisor for each cooperative, and an admin
    assert Farm.objects.count() == 6 and Batch.objects.count() == 24 and SensorReading.objects.count() == counts['readings']


def test_every_account_is_marked_and_none_can_be_signed_in_with_a_password():
    seed(**SMALL)
    users = User.objects.all()
    assert users.count() == 9
    assert all(user.email.endswith(f'@{DOMAIN}') for user in users)
    assert not any(user.has_usable_password() for user in users)


def test_the_dates_are_the_ones_it_chose_and_not_the_time_it_ran():
    seed(**SMALL)
    assert not SensorReading.objects.filter(timestamp__gt=NOW).exists()
    assert SensorReading.objects.order_by('timestamp').first().timestamp >= NOW - timedelta(days=2, hours=1)
    assert Batch.objects.order_by('-start_date').first().start_date <= NOW - timedelta(days=1)
    assert AlertLog.objects.filter(created_at__gt=NOW).count() == 0


def test_the_models_are_left_as_it_found_them():
    seed(**SMALL)
    assert SensorReading._meta.get_field('timestamp').auto_now_add is True
    assert Batch._meta.get_field('start_date').auto_now_add is True


def test_each_farm_has_two_running_batches_and_the_rest_harvested():
    seed(**SMALL)
    for farm in Farm.objects.all():
        stages = sorted(farm.batches.values_list('stage', flat=True)) if hasattr(farm, 'batches') else []
        assert len(stages) == 4
        assert stages.count('HARVEST') == 2


def test_it_will_not_make_the_same_world_twice():
    seed(**SMALL)
    with pytest.raises(SystemExit):
        seed(**SMALL)


def test_the_same_number_makes_the_same_data():
    seed(**SMALL, seed_number=7)
    first = sorted(SensorReading.objects.values_list('temperature', flat=True))
    SensorReading.objects.all().delete()
    User.objects.all().delete()
    Farm.objects.all().delete()
    IoTDevice.objects.all().delete()
    Cooperative.objects.all().delete()
    seed(**SMALL, seed_number=7)
    assert sorted(SensorReading.objects.values_list('temperature', flat=True)) == first


def test_the_app_reads_it(jwt_client):
    seed(**SMALL)
    farmer = User.objects.filter(role='FARMER').order_by('email').first()
    supervisor = User.objects.filter(role='SUPERVISOR').order_by('email').first()
    mine = jwt_client(farmer).get('/api/farms')
    assert mine.status_code == 200 and len(mine.json()['data']) == 1
    ours = jwt_client(supervisor).get('/api/farms')
    assert ours.status_code == 200 and len(ours.json()['data']) == 3    # 6 farms over 2 cooperatives
    assert jwt_client(supervisor).get('/api/team/decisions').status_code == 200
    assert jwt_client(farmer).get('/api/supply/onboarding').status_code == 200
