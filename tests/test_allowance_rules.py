"""The rules of an allowance. `supply/allowance.py` is the only code that changes one."""
import pytest

from supply import allowance
from supply.models import Allowance, AllowanceChange, AllowanceRequest, SupplySettings
from tests.factories import CooperativeFactory, UserFactory

pytestmark = pytest.mark.django_db


def world():
    coop = CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    farmer = UserFactory(role='FARMER', cooperative=coop)
    return coop, supervisor, farmer


def fails(call):
    with pytest.raises(allowance.AllowanceError) as caught:
        call()
    return caught.value.code, caught.value.status


# ── what a farmer has now ─────────────────────────────────────────────────────

def test_a_farmer_with_no_row_has_the_cooperative_default():
    coop, _, farmer = world()
    SupplySettings.objects.create(cooperative=coop, starter_boxes=3)
    assert allowance.current(farmer) == {'boxes': 3, 'source': 'default', 'since': None}
    assert Allowance.objects.count() == 0


def test_a_farmer_with_a_row_has_it_and_the_date():
    coop, supervisor, farmer = world()
    row = allowance.set_start(farmer, coop, 4, by=supervisor)
    now = allowance.current(farmer)
    assert (now['boxes'], now['source'], now['since']) == (4, 'set', row.since)


def test_a_row_from_another_cooperative_is_ignored():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 5, by=supervisor)
    new_coop = CooperativeFactory()
    SupplySettings.objects.create(cooperative=new_coop, starter_boxes=1)
    farmer.cooperative = new_coop
    farmer.save()
    assert allowance.current(farmer) == {'boxes': 1, 'source': 'default', 'since': None}


def test_a_farmer_in_no_cooperative_has_nothing():
    farmer = UserFactory(role='FARMER', cooperative=None)
    assert allowance.current(farmer) == {'boxes': 0, 'source': 'none', 'since': None}


# ── the start ─────────────────────────────────────────────────────────────────

def test_set_start_writes_the_row_and_one_start_line():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 3, by=supervisor)
    change = AllowanceChange.objects.get()
    assert (change.kind, change.old_boxes, change.new_boxes, change.decided_by_id) == ('start', None, 3, supervisor.pk)


@pytest.mark.parametrize('boxes', [-1, 101, 2.5, 'x', None, True])
def test_a_start_must_be_a_whole_number_from_0_to_100(boxes):
    coop, supervisor, farmer = world()
    assert fails(lambda: allowance.set_start(farmer, coop, boxes, by=supervisor)) == ('bad_boxes', 422)


def test_a_new_start_in_another_cooperative_replaces_the_old_row():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 5, by=supervisor)
    new_coop = CooperativeFactory()
    farmer.cooperative = new_coop
    farmer.save()
    allowance.set_start(farmer, new_coop, 2, by=None)
    row = Allowance.objects.get()
    assert (row.cooperative_id, row.boxes) == (new_coop.pk, 2)
    assert AllowanceChange.objects.count() == 2


# ── lowering ──────────────────────────────────────────────────────────────────

def test_a_supervisor_lowers_with_a_reason_and_the_history_says_who():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 3, by=supervisor)
    allowance.lower(farmer, 1, 'Outbreak last month', by=supervisor)
    assert allowance.current(farmer)['boxes'] == 1
    change = AllowanceChange.objects.filter(kind='reduction').get()
    assert (change.old_boxes, change.new_boxes, change.reason, change.decided_by_id) == (3, 1, 'Outbreak last month', supervisor.pk)


def test_a_supervisor_cannot_raise_and_an_equal_amount_is_no_change():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 3, by=supervisor)
    assert fails(lambda: allowance.lower(farmer, 4, 'More space now', by=supervisor)) == ('cannot_raise', 422)
    assert fails(lambda: allowance.lower(farmer, 3, 'Nothing really', by=supervisor)) == ('no_change', 422)
    assert allowance.current(farmer)['boxes'] == 3


def test_a_reason_under_ten_characters_is_refused():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 3, by=supervisor)
    assert fails(lambda: allowance.lower(farmer, 1, 'short', by=supervisor)) == ('reason_needed', 422)
    assert fails(lambda: allowance.lower(farmer, 1, 'x' * 501, by=supervisor)) == ('reason_needed', 422)


def test_the_first_change_of_a_farmer_with_no_row_writes_the_default_start_first():
    coop, supervisor, farmer = world()
    SupplySettings.objects.create(cooperative=coop, starter_boxes=4)
    allowance.lower(farmer, 2, 'Space is tight now', by=supervisor)
    lines = list(AllowanceChange.objects.order_by('decided_at').values_list('kind', 'old_boxes', 'new_boxes'))
    assert lines == [('start', None, 4), ('reduction', 4, 2)]
    assert allowance.current(farmer)['source'] == 'set'


def test_an_admin_may_raise_and_it_reads_as_an_amendment():
    coop, _, farmer = world()
    admin = UserFactory(role='ADMIN')
    allowance.set_start(farmer, coop, 2, by=None)
    allowance.set_as_admin(farmer, 6, 'Agreed with the cooperative', by=admin)
    change = AllowanceChange.objects.filter(kind='amendment').get()
    assert (change.old_boxes, change.new_boxes, change.decided_by_id) == (2, 6, admin.pk)
    allowance.set_as_admin(farmer, 1, 'Lowered after the visit', by=admin)
    assert AllowanceChange.objects.filter(kind='reduction').count() == 1


def test_changing_a_farmer_who_is_in_no_cooperative_is_refused():
    farmer = UserFactory(role='FARMER', cooperative=None)
    supervisor = UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())
    assert fails(lambda: allowance.lower(farmer, 1, 'Not in a cooperative', by=supervisor)) == ('not_in_cooperative', 409)


# ── asking ────────────────────────────────────────────────────────────────────

def test_a_farmer_asks_with_a_reason_and_no_row_is_written():
    coop, _, farmer = world()
    request = allowance.ask(farmer, 4, 'I built a second house')
    assert (request.status, request.boxes_asked, request.cooperative_id) == ('requested', 4, coop.pk)
    assert Allowance.objects.count() == 0


def test_asking_needs_a_reason_a_valid_amount_and_a_different_one():
    coop, _, farmer = world()
    allowance.set_start(farmer, coop, 2, by=None)
    assert fails(lambda: allowance.ask(farmer, 4, 'short')) == ('reason_needed', 422)
    assert fails(lambda: allowance.ask(farmer, 101, 'I built a second house')) == ('bad_boxes', 422)
    assert fails(lambda: allowance.ask(farmer, 2, 'I built a second house')) == ('same_amount', 422)
    assert AllowanceRequest.objects.count() == 0


def test_a_second_open_request_is_refused_but_a_new_one_after_a_decision_is_fine():
    coop, supervisor, farmer = world()
    first = allowance.ask(farmer, 4, 'I built a second house')
    assert fails(lambda: allowance.ask(farmer, 5, 'I built a third house')) == ('request_open', 409)
    allowance.decide(first, supervisor, 'decline', note='Not this season')
    assert allowance.ask(farmer, 5, 'I built a third house').status == 'requested'


def test_asking_from_no_cooperative_is_refused():
    farmer = UserFactory(role='FARMER', cooperative=None)
    assert fails(lambda: allowance.ask(farmer, 3, 'I built a second house')) == ('not_in_cooperative', 409)


# ── withdrawing ───────────────────────────────────────────────────────────────

def test_the_owner_withdraws_an_open_request_once():
    _, _, farmer = world()
    request = allowance.ask(farmer, 4, 'I built a second house')
    allowance.withdraw(request, farmer)
    request.refresh_from_db()
    assert request.status == 'withdrawn'
    assert fails(lambda: allowance.withdraw(request, farmer)) == ('nothing_to_withdraw', 409)


def test_someone_else_cannot_withdraw_it():
    coop, _, farmer = world()
    request = allowance.ask(farmer, 4, 'I built a second house')
    other = UserFactory(role='FARMER', cooperative=coop)
    assert fails(lambda: allowance.withdraw(request, other)) == ('not_found', 404)


# ── deciding ──────────────────────────────────────────────────────────────────

def test_approving_without_an_amount_grants_what_was_asked_and_writes_the_history():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 2, by=None)
    request = allowance.ask(farmer, 4, 'I built a second house')
    decided = allowance.decide(request, supervisor, 'approve')
    assert (decided.status, decided.boxes_granted, decided.decided_by_id) == ('approved', 4, supervisor.pk)
    assert allowance.current(farmer)['boxes'] == 4
    change = AllowanceChange.objects.filter(kind='amendment').get()
    assert (change.old_boxes, change.new_boxes, change.reason, change.decided_by_id) == (2, 4, 'I built a second house', supervisor.pk)


def test_approving_another_amount_grants_that_amount():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 2, by=None)
    request = allowance.ask(farmer, 6, 'I built a second house')
    decided = allowance.decide(request, supervisor, 'approve', boxes=3, note='Three for now')
    assert (decided.boxes_granted, decided.decision_note) == (3, 'Three for now')
    assert allowance.current(farmer)['boxes'] == 3


def test_approving_for_a_farmer_with_no_row_writes_the_default_start_then_the_amendment():
    coop, supervisor, farmer = world()
    request = allowance.ask(farmer, 5, 'I built a second house')
    allowance.decide(request, supervisor, 'approve')
    kinds = list(AllowanceChange.objects.order_by('decided_at').values_list('kind', flat=True))
    assert kinds == ['start', 'amendment']


def test_a_decline_needs_a_note_and_changes_nothing():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 2, by=None)
    request = allowance.ask(farmer, 4, 'I built a second house')
    assert fails(lambda: allowance.decide(request, supervisor, 'decline')) == ('note_required', 422)
    decided = allowance.decide(request, supervisor, 'decline', note='Not this season')
    assert (decided.status, decided.boxes_granted) == ('declined', None)
    assert allowance.current(farmer)['boxes'] == 2


def test_a_bad_decision_word_is_refused():
    _, supervisor, farmer = world()
    request = allowance.ask(farmer, 4, 'I built a second house')
    assert fails(lambda: allowance.decide(request, supervisor, 'maybe')) == ('bad_decision', 400)


def test_a_second_decision_on_the_same_request_loses():
    coop, supervisor, farmer = world()
    other = UserFactory(role='SUPERVISOR', cooperative=coop)
    request = allowance.ask(farmer, 4, 'I built a second house')
    allowance.decide(request, supervisor, 'approve')
    assert fails(lambda: allowance.decide(request, other, 'decline', note='Too late')) == ('nothing_to_review', 409)
    assert allowance.current(farmer)['boxes'] == 4


def test_a_withdrawn_request_cannot_be_decided():
    _, supervisor, farmer = world()
    request = allowance.ask(farmer, 4, 'I built a second house')
    allowance.withdraw(request, farmer)
    assert fails(lambda: allowance.decide(request, supervisor, 'approve')) == ('nothing_to_review', 409)


def test_a_farmer_who_left_the_cooperative_cannot_be_granted_and_the_request_stays_open():
    coop, supervisor, farmer = world()
    request = allowance.ask(farmer, 4, 'I built a second house')
    farmer.cooperative = None
    farmer.save()
    assert fails(lambda: allowance.decide(request, supervisor, 'approve')) == ('not_in_cooperative', 409)
    request.refresh_from_db()
    assert request.status == 'requested'
    assert Allowance.objects.count() == 0


def test_an_amount_that_became_the_current_one_is_approved_without_a_history_line():
    coop, supervisor, farmer = world()
    allowance.set_start(farmer, coop, 2, by=None)
    request = allowance.ask(farmer, 4, 'I built a second house')
    allowance.set_as_admin(farmer, 4, 'Agreed in a visit', by=UserFactory(role='ADMIN'))
    before = AllowanceChange.objects.count()
    allowance.decide(request, supervisor, 'approve')
    assert AllowanceChange.objects.count() == before
