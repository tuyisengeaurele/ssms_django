import pytest

from tests.factories import BatchFactory, FarmFactory, SensorReadingFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_factories_build_full_graph():
    user = UserFactory()
    farm = FarmFactory(owner=user)
    batch = BatchFactory(farm=farm)
    reading = SensorReadingFactory(batch=batch)

    assert reading.batch.farm.owner == user
    assert user.check_password('Pass1234')
    assert user.is_email_verified is True
