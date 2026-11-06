import pytest
from cryptography.fernet import Fernet
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
    # A new key for every test, made here and never written down, so no key sits in the repository.
    settings.MFA_ENCRYPTION_KEY = Fernet.generate_key().decode()
    # Good answers are not sampled into the request log, so one test cannot change another's counts. Failures still are.
    settings.REQUEST_LOG_SAMPLE_RATE = 0.0
    # A cheap hasher first, so building a dozen users stays fast. The real hashers stay in the list,
    # so old hashes still verify. Tests about hashing can set PASSWORD_HASHERS themselves.
    settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher', *settings.PASSWORD_HASHERS]
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


@pytest.fixture
def jwt_client():
    """jwt_client(user) signs in with a real access token, the way a browser does.

    force_authenticate skips the check that rejects deactivated users, so tests about
    inactive accounts need a real token. An admin gets a real session that passed a code, because the API
    refuses an admin session that did not.
    """
    from django.utils import timezone
    from rest_framework_simplejwt.tokens import AccessToken

    from users.models import UserSession

    def make(user):
        token = AccessToken.for_user(user)
        if user.role == 'ADMIN':
            now = timezone.now()
            session = UserSession.objects.create(
                user=user, last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now), mfa_verified_at=now,
            )
            token['sid'] = session.id
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return client

    return make


@pytest.fixture
def naive_batch_dates(db):
    """The batch dates as an older database holds them: no time zone, so Django hands them back naive.

    The owner's local database was built before Django and stores batches.startDate and expectedHarvestDate this way,
    while the test database is built from migrations and has proper time zone columns, so a test has to ask for it. The
    change is made inside the test's transaction and rolled back with it.
    """
    from django.db import connection

    with connection.cursor() as cursor:
        # Rows made earlier in the test leave constraint checks waiting, and a table cannot be altered until they run.
        cursor.execute('SET CONSTRAINTS ALL IMMEDIATE')
        cursor.execute(
            'ALTER TABLE batches ALTER COLUMN "startDate" TYPE timestamp without time zone, '
            'ALTER COLUMN "expectedHarvestDate" TYPE timestamp without time zone'
        )
        cursor.execute('SET CONSTRAINTS ALL DEFERRED')
