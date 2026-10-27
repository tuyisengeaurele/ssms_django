"""A batch's readings over a chosen time, averaged into buckets small enough to draw."""
from datetime import timedelta

import pytest
from django.utils import timezone

from sensors.models import SensorReading
from tests.factories import BatchFactory, FarmFactory, SensorReadingFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner():
    return UserFactory(role='FARMER')


@pytest.fixture
def batch(owner):
    return BatchFactory(farm=FarmFactory(owner=owner))


def add(batch, temperature, humidity, hours_ago):
    row = SensorReadingFactory(batch=batch, temperature=temperature, humidity=humidity)
    SensorReading.objects.filter(pk=row.pk).update(timestamp=timezone.now() - timedelta(hours=hours_ago))


def add_at(batch, temperature, humidity, hours_back, minute):
    """A reading at an exact minute of the hour that began `hours_back` hours ago, so hour buckets are not left to chance."""
    hour = timezone.now().replace(minute=0, second=0, microsecond=0) - timedelta(hours=hours_back)
    row = SensorReadingFactory(batch=batch, temperature=temperature, humidity=humidity)
    SensorReading.objects.filter(pk=row.pk).update(timestamp=hour + timedelta(minutes=minute))


def series(client, batch, hours=None):
    query = f'?hours={hours}' if hours is not None else ''
    return client.get(f'/api/sensors/batch/{batch.pk}/series{query}')


def test_a_batch_without_readings_gives_an_empty_list(auth_client, owner, batch):
    response = series(auth_client(owner), batch)
    assert response.status_code == 200
    assert response.json()['data'] == []


def test_a_day_is_shown_hour_by_hour_averaged_and_oldest_first(auth_client, owner, batch):
    add_at(batch, 20.0, 70.0, hours_back=5, minute=10)
    add_at(batch, 22.0, 74.0, hours_back=5, minute=40)   # same hour as the one above
    add_at(batch, 26.0, 80.0, hours_back=2, minute=20)
    rows = series(auth_client(owner), batch, 24).json()['data']
    assert [(r['temperature'], r['humidity'], r['count']) for r in rows] == [(21.0, 72.0, 2), (26.0, 80.0, 1)]
    assert rows[0]['timestamp'] < rows[1]['timestamp']


def test_the_default_window_is_one_day(auth_client, owner, batch):
    add(batch, 25.0, 78.0, 3)
    add(batch, 25.0, 78.0, 30)
    assert len(series(auth_client(owner), batch).json()['data']) == 1


def test_readings_outside_the_window_are_left_out(auth_client, owner, batch):
    add(batch, 25.0, 78.0, 3)
    add(batch, 25.0, 78.0, 100)
    assert len(series(auth_client(owner), batch, 24).json()['data']) == 1
    assert len(series(auth_client(owner), batch, 168).json()['data']) == 2


def test_a_month_is_averaged_into_six_hour_buckets_so_it_stays_small(auth_client, owner, batch):
    for hours_ago in range(1, 24 * 10 + 1):   # ten days, one reading an hour
        add(batch, 24.0 + (hours_ago % 3), 78.0, hours_ago)
    rows = series(auth_client(owner), batch, 720).json()['data']
    assert 38 <= len(rows) <= 42
    assert all(r['count'] >= 1 for r in rows)


def test_a_week_stays_hourly(auth_client, owner, batch):
    for hours_ago in range(1, 49):
        add(batch, 25.0, 78.0, hours_ago)
    assert len(series(auth_client(owner), batch, 168).json()['data']) >= 47


@pytest.mark.parametrize('hours', ['0', '-3', '721', 'soon', '2.5'])
def test_a_window_that_makes_no_sense_is_a_422(auth_client, owner, batch, hours):
    assert series(auth_client(owner), batch, hours).status_code == 422


def test_another_farmer_cannot_read_it(auth_client, batch):
    assert series(auth_client(UserFactory(role='FARMER')), batch).status_code == 404


def test_signing_in_is_required(api_client, batch):
    assert series(api_client, batch).status_code == 401


def test_the_number_of_queries_does_not_grow_with_the_readings(auth_client, owner, batch, django_assert_max_num_queries):
    for hours_ago in range(1, 60):
        add(batch, 25.0, 78.0, hours_ago)
    with django_assert_max_num_queries(6):
        assert series(auth_client(owner), batch, 168).status_code == 200
