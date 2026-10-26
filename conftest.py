import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

# DRF reads its throttle rates when this module is first imported. Importing it here, before any
# test overrides the settings, keeps those rates intact however the tests are ordered.
import core.throttles  # noqa: F401


def _clear_cache():
    # The cache lives in the database, so tests that have no database simply have nothing to clear.
    try:
        cache.clear()
    except (RuntimeError, AssertionError):  # pytest-django and SimpleTestCase refuse database access differently
        pass


@pytest.fixture(autouse=True)
def _quiet_settings(request, settings):
    """Real throttles only when a test asks for them, and mail never leaves the machine."""
    rest = dict(settings.REST_FRAMEWORK)
    if request.node.get_closest_marker('throttle') is None:
        rest['DEFAULT_THROTTLE_CLASSES'] = []
    settings.REST_FRAMEWORK = rest
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    _clear_cache()
    yield
    _clear_cache()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client():
    """auth_client(user) returns an APIClient signed in as that user."""

    def make(user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    return make
