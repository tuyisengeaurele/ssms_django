from datetime import timedelta

import pytest
from django.utils import timezone

from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db


def make_session(user, **extra):
    now = timezone.now()
    fields = dict(
        user=user, expires_at=now + timedelta(days=30),
        last_used_at=now, last_activity_at=now,
    )
    fields.update(extra)
    return UserSession.objects.create(**fields)


def test_session_ids_are_not_guessable():
    session = make_session(UserFactory())
    assert session.id.startswith('c') and len(session.id) > 20


def test_a_session_is_alive_until_it_is_revoked():
    session = make_session(UserFactory())
    now = timezone.now()
    assert session.is_alive(now)
    session.revoked_at = now
    assert not session.is_alive(now)


def test_a_session_is_not_alive_after_its_end_date():
    session = make_session(UserFactory(), expires_at=timezone.now() - timedelta(seconds=1))
    assert not session.is_alive(timezone.now())


def test_a_new_session_ends_after_the_absolute_limit(settings):
    settings.SESSION_ABSOLUTE_DAYS = 30
    start = timezone.now()
    ends = UserSession.ends_at(start)
    assert ends - start == timedelta(days=30)


def test_deleting_a_user_deletes_their_sessions():
    user = UserFactory()
    make_session(user)
    user.delete()
    assert UserSession.objects.count() == 0


def test_a_new_session_starts_with_no_remembered_tokens():
    assert make_session(UserFactory()).tokens == []


def test_a_session_does_not_keep_the_address_of_the_person():
    assert 'ip_address' not in {field.name for field in UserSession._meta.get_fields()}
