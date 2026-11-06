"""Builders shared by the support access tests."""
from datetime import timedelta

from django.utils import timezone

from support_access import services
from support_access.models import SupportAccess
from tests.factories import UserFactory
from users.models import UserSession

REASON = 'Please look at my batch list'


def admin_and_person(role='FARMER'):
    return UserFactory(role='ADMIN'), UserFactory(role=role)


def admin_session(admin) -> UserSession:
    """A live sign in of the admin that passed a code, the way the real sign in makes one."""
    now = timezone.now()
    return UserSession.objects.create(
        user=admin, last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now), mfa_verified_at=now,
    )


def acting(admin, person, mode='view', minutes=30):
    """Runs the whole way to a started visit. Returns the access token and the row."""
    access = services.ask(admin, person, reason=REASON, minutes=minutes, mode=mode)
    access = services.respond(access, person, allow=True, allow_edit=(mode == 'edit'))
    token = services.start(access, admin, admin_session(admin).id)
    access.refresh_from_db()
    return token, access


def age(access, **delta):
    """Moves every moment of the row, and the support sign in's end, back in time, so a time limit has passed."""
    shift = timedelta(**delta)
    changes = {
        name: getattr(access, name) - shift
        for name in ('requested_at', 'decided_at', 'started_at', 'ends_at')
        if getattr(access, name) is not None
    }
    SupportAccess.objects.filter(pk=access.pk).update(**changes)
    for session in UserSession.objects.filter(support_access_id=access.pk):
        UserSession.objects.filter(pk=session.pk).update(expires_at=session.expires_at - shift)
    access.refresh_from_db()
    return access
