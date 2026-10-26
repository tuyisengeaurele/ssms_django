"""A page should cost the same number of queries whether it shows one batch or fifty."""
import pytest

from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    SensorReadingFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def busy_farm():
    owner = UserFactory()
    farm = FarmFactory(owner=owner)
    for _ in range(5):
        batch = BatchFactory(farm=farm)
        SensorReadingFactory.create_batch(3, batch=batch)
        DiseaseDetectionFactory.create_batch(2, batch=batch)
        AlertLogFactory(batch=batch)
    return owner, farm


def test_farm_page_query_count_does_not_grow_with_batches(auth_client, busy_farm, django_assert_max_num_queries):
    owner, farm = busy_farm
    with django_assert_max_num_queries(8):
        response = auth_client(owner).get(f'/api/farms/{farm.pk}')
    assert response.status_code == 200
    batches = response.json()['data']['batches']
    assert len(batches) == 5
    assert batches[0]['counts'] == {'diseaseDetections': 2, 'sensorReadings': 3, 'alertLogs': 1}


def test_batches_of_a_farm_query_count_does_not_grow(auth_client, busy_farm, django_assert_max_num_queries):
    owner, farm = busy_farm
    with django_assert_max_num_queries(8):
        response = auth_client(owner).get(f'/api/batches/farm/{farm.pk}')
    assert response.status_code == 200
    assert len(response.json()['data']) == 5


def test_active_batches_query_count_does_not_grow(auth_client, busy_farm, django_assert_max_num_queries):
    owner, _ = busy_farm
    with django_assert_max_num_queries(8):
        response = auth_client(owner).get('/api/batches/active')
    assert response.status_code == 200
    assert len(response.json()['data']) == 5
