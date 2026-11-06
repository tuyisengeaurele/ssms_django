"""The allowance tables: the cooperative's settings, a farmer's amount, its history and the requests to change it."""
import pytest
from django.db import IntegrityError, transaction

from supply.models import ALLOWANCE_MAX, ALLOWANCE_MIN, Allowance, AllowanceChange, AllowanceRequest, SupplySettings
from tests.factories import CooperativeFactory, UserFactory

pytestmark = pytest.mark.django_db


def farmer_in(coop):
    return UserFactory(role='FARMER', cooperative=coop)


def test_the_bounds_are_whole_boxes_from_0_to_100():
    assert (ALLOWANCE_MIN, ALLOWANCE_MAX) == (0, 100)


def test_settings_are_made_once_per_cooperative_with_the_default_and_no_room_per_box():
    coop = CooperativeFactory()
    first = SupplySettings.for_cooperative(coop)
    assert (first.starter_boxes, first.m2_per_box) == (2, None)
    assert SupplySettings.for_cooperative(coop).pk == first.pk
    assert SupplySettings.objects.count() == 1


def test_ids_are_the_project_string_ids():
    coop = CooperativeFactory()
    assert isinstance(SupplySettings.for_cooperative(coop).pk, str)


def test_a_farmer_has_one_allowance():
    coop = CooperativeFactory()
    farmer = farmer_in(coop)
    Allowance.objects.create(farmer=farmer, cooperative=coop, boxes=2)
    with pytest.raises(IntegrityError), transaction.atomic():
        Allowance.objects.create(farmer=farmer, cooperative=coop, boxes=3)


def test_only_one_request_can_be_open_per_farmer_but_a_decided_one_does_not_count():
    coop = CooperativeFactory()
    farmer = farmer_in(coop)
    AllowanceRequest.objects.create(farmer=farmer, cooperative=coop, boxes_asked=4, reason='More room now', status='declined')
    AllowanceRequest.objects.create(farmer=farmer, cooperative=coop, boxes_asked=3, reason='Built a new house')
    with pytest.raises(IntegrityError), transaction.atomic():
        AllowanceRequest.objects.create(farmer=farmer, cooperative=coop, boxes_asked=5, reason='Another try please')
    other = farmer_in(coop)
    AllowanceRequest.objects.create(farmer=other, cooperative=coop, boxes_asked=3, reason='Built a new house')


def test_a_change_keeps_old_and_new_and_who_and_why():
    coop = CooperativeFactory()
    farmer = farmer_in(coop)
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    change = AllowanceChange.objects.create(
        farmer=farmer, cooperative=coop, old_boxes=3, new_boxes=1, kind='reduction', reason='Outbreak last month', decided_by=supervisor,
    )
    assert (change.old_boxes, change.new_boxes, change.kind, change.decided_by_id) == (3, 1, 'reduction', supervisor.pk)
    assert change.decided_at is not None
    assert {k for k, _ in AllowanceChange.Kind.choices} == {'start', 'amendment', 'suggestion', 'reduction'}
