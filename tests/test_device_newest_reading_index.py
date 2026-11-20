"""The newest reading of each device is found through an index on the device and the time.

The list took every reading of every device and sorted them to keep the first of each: 327 ms for 400 devices with 288,000 readings.
The faster way (the newest reading of one device, 400 times) is only safe with an index on the device and the time: without it, the
database walks the timestamp index backwards looking for the device, which is quick while every device reported a moment ago and a
long walk for one that went quiet weeks ago.
"""
from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone

from sensors.models import SensorReading
from sensors.views import newest_readings_query
from tests.factories import FarmFactory, IoTDeviceFactory, SensorReadingFactory, UserFactory

pytestmark = pytest.mark.django_db


def reading(device, temperature, hours_ago):
    row = SensorReadingFactory(device=device, temperature=temperature, humidity=70.0)
    SensorReading.objects.filter(pk=row.pk).update(timestamp=timezone.now() - timedelta(hours=hours_ago))
    return row


def test_the_readings_table_has_an_index_on_the_device_and_the_time_newest_first():
    with connection.cursor() as cursor:
        constraints = connection.introspection.get_constraints(cursor, 'sensor_readings')
    index = constraints.get('sensor_device_time_idx')
    assert index is not None, sorted(constraints)
    assert index['columns'] == ['deviceId', 'timestamp']
    assert index['orders'] == ['ASC', 'DESC']


def test_the_newest_readings_are_found_through_that_index():
    farm = FarmFactory()
    devices = [IoTDeviceFactory(farm=farm) for _ in range(3)]
    for number, device in enumerate(devices):
        reading(device, 20.0 + number, hours_ago=number + 1)
    sql, params = newest_readings_query([d.pk for d in devices]).query.sql_with_params()
    with connection.cursor() as cursor:
        cursor.execute('SET LOCAL enable_seqscan = off')
        cursor.execute('EXPLAIN ' + sql, params)
        plan = '\n'.join(row[0] for row in cursor.fetchall())
    assert 'sensor_device_time_idx' in plan, plan
    assert 'Seq Scan on sensor_readings' not in plan, plan


def test_a_device_that_went_quiet_long_ago_still_shows_its_last_reading(auth_client):
    owner = UserFactory(role='FARMER')
    farm = FarmFactory(owner=owner)
    quiet, busy = IoTDeviceFactory(farm=farm), IoTDeviceFactory(farm=farm)
    reading(quiet, 17.5, hours_ago=24 * 40)
    for hours in range(1, 30):
        reading(busy, 25.0, hours_ago=hours)
    rows = {item['id']: item for item in auth_client(owner).get('/api/devices').json()['data']}
    assert rows[quiet.pk]['latestReading']['temperature'] == 17.5
    assert rows[busy.pk]['latestReading']['temperature'] == 25.0


def test_the_newest_of_several_readings_with_the_same_device_wins():
    farm = FarmFactory()
    device = IoTDeviceFactory(farm=farm)
    reading(device, 18.0, hours_ago=9)
    newest = reading(device, 26.5, hours_ago=1)
    reading(device, 21.0, hours_ago=5)
    assert [row.pk for row in newest_readings_query([device.pk])] == [newest.pk]
