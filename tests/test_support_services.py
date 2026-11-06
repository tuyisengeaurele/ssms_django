"""The life of a support request: asking, answering, starting, ending, and the time limits.

Time is moved with `age()` (the rows are changed), as the idle tests do, so no clock library is needed.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from support_access import services
from support_access.models import SupportAccess
from support_access.services import SupportError
from tests.factories import UserFactory
from tests.support_helpers import REASON, acting, admin_and_person, admin_session, age
from users.models import UserSession

pytestmark = pytest.mark.django_db

Status = SupportAccess.Status


def ask(admin, person, **over):
    fields = {'reason': REASON, 'minutes': 30, 'mode': 'view', **over}
    return services.ask(admin, person, **fields)


def code_of(call):
    with pytest.raises(SupportError) as refused:
        call()
    return refused.value.code


# ── asking ────────────────────────────────────────────────────────────────────

def test_a_request_is_saved_with_copies_of_the_names():
    admin, person = admin_and_person()
    access = ask(admin, person)
    assert access.status == Status.REQUESTED
    assert (access.admin_email, access.person_email) == (admin.email, person.email)
    assert (access.admin_name, access.person_name) == (admin.name, person.name)
    assert access.requested_mode == 'view' and access.minutes == 30 and access.granted_mode == ''


def test_a_supervisor_may_be_asked_too():
    admin, person = admin_and_person('SUPERVISOR')
    assert ask(admin, person).person_id == person.pk


@pytest.mark.parametrize('build,code', [
    (lambda a, p: (a, UserFactory(role='ADMIN')), 'target_not_allowed'),
    (lambda a, p: (a, a), 'target_not_allowed'),
    (lambda a, p: (a, UserFactory(is_active=False)), 'target_not_allowed'),
])
def test_the_wrong_people_are_refused(build, code):
    admin, person = admin_and_person()
    who, target = build(admin, person)
    assert code_of(lambda: ask(who, target)) == code


@pytest.mark.parametrize('over,code', [
    ({'reason': 'too short'}, 'invalid_reason'),
    ({'reason': 'x' * 301}, 'invalid_reason'),
    ({'reason': ' ' * 20}, 'invalid_reason'),
    ({'minutes': 20}, 'invalid_length'),
    ({'mode': 'x'}, 'invalid_mode'),
])
def test_bad_input_is_refused(over, code):
    admin, person = admin_and_person()
    assert code_of(lambda: ask(admin, person, **over)) == code
    assert SupportAccess.objects.count() == 0


def test_an_admin_with_an_open_request_cannot_ask_again():
    admin, person = admin_and_person()
    ask(admin, person)
    assert code_of(lambda: ask(admin, UserFactory())) == 'admin_busy'


def test_a_person_with_an_open_request_cannot_be_asked_again():
    admin, person = admin_and_person()
    ask(admin, person)
    assert code_of(lambda: ask(UserFactory(role='ADMIN'), person)) == 'person_busy'


def test_a_request_that_ran_out_of_time_does_not_block_a_new_one():
    admin, person = admin_and_person()
    age(ask(admin, person), minutes=6)
    assert ask(admin, person).status == Status.REQUESTED


# ── the time limits ───────────────────────────────────────────────────────────

def test_an_unanswered_request_expires_after_five_minutes():
    admin, person = admin_and_person()
    access = age(ask(admin, person), minutes=5, seconds=1)
    assert services.settle(access).status == Status.EXPIRED


def test_a_request_inside_five_minutes_stays_open():
    admin, person = admin_and_person()
    access = age(ask(admin, person), minutes=4)
    assert services.settle(access).status == Status.REQUESTED


def test_an_allowed_request_expires_ten_minutes_after_the_answer():
    admin, person = admin_and_person()
    access = services.respond(ask(admin, person), person, allow=True, allow_edit=False)
    assert services.settle(age(access, minutes=9)).status == Status.APPROVED
    assert services.settle(age(access, minutes=2)).status == Status.EXPIRED


def test_a_visit_ends_when_its_time_is_up_and_its_sign_in_is_closed():
    admin, person = admin_and_person()
    _, access = acting(admin, person, minutes=15)
    access = services.settle(age(access, minutes=16))
    assert access.status == Status.ENDED and access.ended_by == 'time'
    assert UserSession.objects.get(support_access_id=access.pk).revoked_at is not None


# ── answering ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('asked,ticked,granted', [
    ('edit', True, 'edit'), ('edit', False, 'view'), ('view', True, 'view'), ('view', False, 'view'),
])
def test_edit_is_granted_only_when_asked_and_ticked(asked, ticked, granted):
    admin, person = admin_and_person()
    access = services.respond(ask(admin, person, mode=asked), person, allow=True, allow_edit=ticked)
    assert access.status == Status.APPROVED and access.granted_mode == granted and access.decided_at is not None


def test_a_rejection_closes_the_request():
    admin, person = admin_and_person()
    access = services.respond(ask(admin, person), person, allow=False, allow_edit=True)
    assert access.status == Status.REJECTED and access.granted_mode == ''


def test_only_the_person_asked_may_answer():
    admin, person = admin_and_person()
    access = ask(admin, person)
    with pytest.raises(SupportError) as refused:
        services.respond(access, UserFactory(), allow=True, allow_edit=False)
    assert (refused.value.code, refused.value.status) == ('not_found', 404)


def test_an_expired_or_answered_request_cannot_be_answered():
    admin, person = admin_and_person()
    old = age(ask(admin, person), minutes=6)
    with pytest.raises(SupportError) as refused:
        services.respond(old, person, allow=True, allow_edit=False)
    assert (refused.value.code, refused.value.status) == ('expired', 409)

    other_admin, other_person = admin_and_person()
    done = services.respond(ask(other_admin, other_person), other_person, allow=False, allow_edit=False)
    with pytest.raises(SupportError) as again:
        services.respond(done, other_person, allow=True, allow_edit=False)
    assert (again.value.code, again.value.status) == ('already_answered', 409)


# ── cancelling ────────────────────────────────────────────────────────────────

def test_the_admin_may_withdraw_a_request_before_it_starts():
    admin, person = admin_and_person()
    assert services.cancel(ask(admin, person), admin).status == Status.CANCELLED


def test_a_started_visit_cannot_be_cancelled():
    admin, person = admin_and_person()
    _, access = acting(admin, person)
    with pytest.raises(SupportError) as refused:
        services.cancel(access, admin)
    assert refused.value.status == 409


# ── starting ──────────────────────────────────────────────────────────────────

def allowed(admin, person, **over):
    return services.respond(ask(admin, person, **over), person, allow=True, allow_edit=True)


def test_start_makes_a_sign_in_for_the_person_and_a_token_for_it():
    admin, person = admin_and_person()
    access = allowed(admin, person, minutes=30)
    mine = admin_session(admin)
    token = services.start(access, admin, mine.id)

    access.refresh_from_db()
    assert access.status == Status.ACTIVE and access.admin_session_id == mine.id
    assert access.ends_at - access.started_at == timedelta(minutes=30)

    session = UserSession.objects.get(support_access_id=access.pk)
    assert session.user_id == person.pk and session.expires_at == access.ends_at
    assert session.device_label == 'SSMS support' and session.tokens == []

    claims = AccessToken(token)
    assert claims['user_id'] == person.pk and claims['sid'] == session.id and claims['act'] == admin.pk
    assert abs(claims['exp'] - access.ends_at.timestamp()) < 2


def test_start_needs_an_allowed_request():
    admin, person = admin_and_person()
    access = ask(admin, person)
    with pytest.raises(SupportError) as refused:
        services.start(access, admin, admin_session(admin).id)
    assert (refused.value.code, refused.value.status) == ('not_approved', 409)


def test_start_must_come_within_ten_minutes_of_the_answer():
    admin, person = admin_and_person()
    access = age(allowed(admin, person), minutes=11)
    assert code_of(lambda: services.start(access, admin, admin_session(admin).id)) == 'not_approved'


def test_only_the_admin_who_asked_may_start():
    admin, person = admin_and_person()
    access = allowed(admin, person)
    other = UserFactory(role='ADMIN')
    with pytest.raises(SupportError) as refused:
        services.start(access, other, admin_session(other).id)
    assert (refused.value.code, refused.value.status) == ('not_allowed', 403)


def test_start_needs_the_admins_own_live_sign_in():
    admin, person = admin_and_person()
    access = allowed(admin, person)
    closed = admin_session(admin)
    UserSession.objects.filter(pk=closed.pk).update(revoked_at=timezone.now())
    assert code_of(lambda: services.start(access, admin, closed.id)) == 'admin_session_missing'


# ── the token again, and ending ───────────────────────────────────────────────

def test_the_token_can_be_made_again_for_the_same_visit_by_the_same_admin():
    admin, person = admin_and_person()
    first, access = acting(admin, person)
    again = services.reissue_token(access, admin)
    assert AccessToken(again)['sid'] == AccessToken(first)['sid']
    assert abs(AccessToken(again)['exp'] - access.ends_at.timestamp()) < 2
    with pytest.raises(SupportError):
        services.reissue_token(access, UserFactory(role='ADMIN'))


def test_a_token_is_not_made_for_a_visit_that_is_not_running():
    admin, person = admin_and_person()
    access = allowed(admin, person)
    assert code_of(lambda: services.reissue_token(access, admin)) == 'not_active'


def test_ending_records_who_and_why_and_closes_the_sign_in():
    admin, person = admin_and_person()
    _, access = acting(admin, person)
    assert services.end_support_access(access, 'person', 'person_ended') is True
    access.refresh_from_db()
    assert (access.status, access.ended_by, access.ended_reason) == (Status.ENDED, 'person', 'person_ended')
    assert access.ended_at is not None
    assert UserSession.objects.get(support_access_id=access.pk).revoked_at is not None


def test_ending_twice_changes_nothing_the_second_time():
    admin, person = admin_and_person()
    _, access = acting(admin, person)
    services.end_support_access(access, 'admin', 'admin_ended')
    assert services.end_support_access(access, 'person', 'later') is False
    access.refresh_from_db()
    assert access.ended_by == 'admin'


def test_a_request_that_never_started_can_be_ended_too():
    admin, person = admin_and_person()
    for build in (lambda a, p: ask(a, p), lambda a, p: allowed(a, p)):
        a, p = admin_and_person()
        access = build(a, p)
        assert services.end_support_access(access, 'system', 'person_gone') is True
        access.refresh_from_db()
        assert access.status == Status.ENDED
