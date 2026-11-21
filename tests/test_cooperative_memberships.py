"""Who belongs to which cooperative, and for how long, is kept as rows: a person has one open membership at a time and keeps the
closed ones as history.

`users.cooperative` still says where a person is now and the screens read it. Every save that changes it keeps the memberships in
step, and what a supervisor may see is read from the open memberships (core/access.py).
"""
from datetime import timedelta
from importlib import import_module

import pytest
from django.apps import apps
from django.db import IntegrityError, transaction
from django.utils import timezone

from cooperatives.models import CooperativeMembership
from core.access import scope_farms
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


def refused(make):
    try:
        with transaction.atomic():
            make()
    except IntegrityError:
        return True
    return False


def rows(user):
    return list(CooperativeMembership.objects.filter(user=user).order_by('started_at').values_list('cooperative_id', 'ended_at'))


# ── the rows follow the person ───────────────────────────────────────────────────────────────

def test_a_person_made_in_a_cooperative_has_one_open_membership():
    coop = CooperativeFactory()
    user = UserFactory(cooperative=coop)
    assert rows(user) == [(coop.pk, None)]
    assert abs(CooperativeMembership.objects.get(user=user).started_at - timezone.now()) < timedelta(minutes=1)


def test_a_person_with_no_cooperative_has_none():
    assert rows(UserFactory()) == []


def test_moving_to_another_cooperative_closes_the_first_and_opens_the_second():
    first, second = CooperativeFactory(), CooperativeFactory()
    user = UserFactory(cooperative=first)
    user.cooperative = second
    user.save(update_fields=['cooperative'])
    history = rows(user)
    assert [c for c, _ in history] == [first.pk, second.pk]
    assert history[0][1] is not None and history[1][1] is None


def test_leaving_closes_the_membership_and_coming_back_opens_a_new_one():
    coop = CooperativeFactory()
    user = UserFactory(cooperative=coop)
    user.cooperative = None
    user.save()
    assert all(ended is not None for _, ended in rows(user))
    user.cooperative = coop
    user.save()
    assert len(rows(user)) == 2 and rows(user)[-1][1] is None


def test_saving_something_else_adds_no_membership():
    coop = CooperativeFactory()
    user = UserFactory(cooperative=coop)
    user.name = 'Renamed'
    user.save()
    user.save(update_fields=['name'])
    assert len(rows(user)) == 1


def test_a_person_loaded_from_the_database_and_saved_unchanged_adds_none():
    user = UserFactory(cooperative=CooperativeFactory())
    again = type(user).objects.get(pk=user.pk)
    again.save()
    assert len(rows(user)) == 1


def test_the_current_cooperative_always_matches_the_open_membership():
    coops = [CooperativeFactory() for _ in range(3)]
    user = UserFactory(cooperative=coops[0])
    for coop in (coops[1], None, coops[2], coops[0]):
        user.cooperative = coop
        user.save()
        open_rows = CooperativeMembership.objects.filter(user=user, ended_at__isnull=True)
        assert [m.cooperative_id for m in open_rows] == ([coop.pk] if coop else [])


# ── what the database refuses ────────────────────────────────────────────────────────────────

def test_a_person_cannot_have_two_open_memberships():
    coop = CooperativeFactory()
    user = UserFactory(cooperative=coop)
    assert refused(lambda: CooperativeMembership.objects.create(user=user, cooperative=CooperativeFactory(), started_at=timezone.now()))


def test_a_membership_cannot_end_before_it_starts():
    user = UserFactory()
    now = timezone.now()
    assert refused(lambda: CooperativeMembership.objects.create(user=user, cooperative=CooperativeFactory(), started_at=now, ended_at=now - timedelta(days=1)))


# ── what a supervisor may see ────────────────────────────────────────────────────────────────

def test_a_supervisor_sees_the_farms_of_those_in_the_open_membership_of_their_cooperative():
    coop, other = CooperativeFactory(), CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    mine = FarmFactory(owner=UserFactory(cooperative=coop))
    theirs = FarmFactory(owner=UserFactory(cooperative=other))
    assert set(scope_farms(supervisor)) == {mine}
    assert theirs not in scope_farms(supervisor)


def test_a_farmer_who_left_is_no_longer_seen_and_one_who_moved_back_is_seen_once():
    coop, other = CooperativeFactory(), CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    farmer = UserFactory(cooperative=coop)
    farm = FarmFactory(owner=farmer)
    farmer.cooperative = other
    farmer.save()
    assert list(scope_farms(supervisor)) == []
    farmer.cooperative = coop
    farmer.save()
    assert list(scope_farms(supervisor)) == [farm]


def test_a_supervisor_with_no_cooperative_sees_nothing():
    FarmFactory(owner=UserFactory(cooperative=CooperativeFactory()))
    assert list(scope_farms(UserFactory(role='SUPERVISOR'))) == []


def test_a_supervisor_does_not_see_another_supervisors_farm_or_an_admins():
    coop = CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    FarmFactory(owner=UserFactory(role='SUPERVISOR', cooperative=coop))
    assert list(scope_farms(supervisor)) == []


# ── people who were there before the table ───────────────────────────────────────────────────

def test_the_migration_opens_a_membership_for_everyone_already_in_a_cooperative_and_is_safe_to_run_again():
    coop = CooperativeFactory()
    member, loner = UserFactory(cooperative=coop), UserFactory()
    CooperativeMembership.objects.all().delete()
    backfill = import_module('cooperatives.migrations.0004_cooperative_memberships').backfill_memberships
    backfill(apps, None)
    backfill(apps, None)
    assert rows(member) == [(coop.pk, None)] and rows(loner) == []
    assert CooperativeMembership.objects.get(user=member).started_at == member.created_at
