"""A support request is a row, and the database itself allows only one open request per admin and per person.

The two constraints are what stop a race between two requests, so they are tested on their own here.
"""
import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from logs.models import RequestLog
from support_access.models import SupportAccess
from tests.factories import UserFactory
from users.models import UserSession

pytestmark = pytest.mark.django_db

Status = SupportAccess.Status


def make(admin, person, status=Status.REQUESTED):
    return SupportAccess.objects.create(
        admin=admin, person=person, admin_email=admin.email, admin_name=admin.name,
        person_email=person.email, person_name=person.name,
        reason='Please look at my batch list', minutes=30, requested_mode='view', status=status,
    )


def refused(admin, person, status=Status.REQUESTED):
    with pytest.raises(IntegrityError), transaction.atomic():
        make(admin, person, status)


def test_an_admin_can_have_one_open_request():
    admin = UserFactory(role='ADMIN')
    make(admin, UserFactory())
    refused(admin, UserFactory())


def test_a_person_can_have_one_open_request():
    person = UserFactory()
    make(UserFactory(role='ADMIN'), person)
    refused(UserFactory(role='ADMIN'), person)


def test_closed_requests_do_not_count():
    admin, person = UserFactory(role='ADMIN'), UserFactory()
    for closed in (Status.ENDED, Status.REJECTED, Status.EXPIRED, Status.CANCELLED):
        make(admin, person, closed)
    make(admin, person, Status.REQUESTED)


@pytest.mark.parametrize('first', [Status.APPROVED, Status.ACTIVE])
def test_each_open_status_counts(first):
    admin, person = UserFactory(role='ADMIN'), UserFactory()
    make(admin, person, first)
    refused(admin, UserFactory())
    refused(UserFactory(role='ADMIN'), person)


def test_the_open_statuses_are_the_three_that_are_not_finished():
    assert set(SupportAccess.OPEN) == {Status.REQUESTED, Status.APPROVED, Status.ACTIVE}


def test_a_normal_session_has_no_support_access():
    user = UserFactory()
    now = timezone.now()
    session = UserSession.objects.create(
        user=user, last_used_at=now, last_activity_at=now, expires_at=UserSession.ends_at(now),
    )
    assert session.support_access_id is None


def test_the_request_log_has_the_support_column():
    row = RequestLog.objects.create(request_id='r1', method='GET', route='api/x', status=200)
    row.refresh_from_db()
    assert row.support_access_id == ''
