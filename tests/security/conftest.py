import pytest

from tests.security.world import build_world


@pytest.fixture
def world(db):
    return build_world()
