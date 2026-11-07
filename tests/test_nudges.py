"""Earned allowances: a suggestion is made when a farmer finishes a lot from a supply round in good order, and a supervisor
approves it in one go."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from alerts.models import AlertLog
from audit_log.models import AuditLog
from batches.models import Batch
from farms.models import RearingRoom
from supply import allowance, nudges, rounds
from supply.models import AllowanceChange, AllowanceSuggestion, EggRequest, SupplySettings
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

LIST = '/api/supply/suggestions'
COUNT = '/api/team/decisions'


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')


@pytest.fixture
def outsider():
    return UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())


@pytest.fixture
def sent(monkeypatch):
    mails = []
    monkeypatch.setattr('supply.notify.send_email_async', lambda subject, to, email, **kw: mails.append((subject, to, email)))
    return mails


def lot(coop, supervisor, boxes=2, area='40', m2='4'):
    """A farmer who received `boxes` from a round, with the batch it made. The allowance is the same as the boxes."""
    settings = SupplySettings.for_cooperative(coop)
    settings.m2_per_box = Decimal(m2) if m2 else None
    settings.save()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    allowance.set_start(farmer, coop, boxes, by=None)
    room = RearingRoom.objects.create(farm=FarmFactory(owner=farmer), name='Room A', area_m2=Decimal(area))
    rnd = rounds.create_round(
        coop, supervisor, name='November round', stock_boxes=20, request_deadline=timezone.now() + timedelta(days=3),
        delivery_date=(timezone.now() + timedelta(days=7)).date(), delivery_place='Store', expected_harvest_date=(timezone.now() + timedelta(days=40)).date(),
    )
    rounds.open_round(rnd, supervisor)
    request = rounds.submit_request(farmer, rnd, room, boxes)
    rounds.close_round(rnd)
    rounds.confirm(rnd, supervisor, [{'id': request.pk, 'boxes': boxes}])
    batch = rounds.receive(EggRequest.objects.get(pk=request.pk), farmer, boxes, 'good')
    Batch.objects.filter(pk=batch.pk).update(stage='COCOON')
    batch.refresh_from_db()
    return farmer, batch


def harvest(auth_client, farmer, batch):
    return auth_client(farmer).post(f'/api/harvest/batch/{batch.pk}', {'cocoonWeightKg': 5, 'qualityGrade': 'A'}, format='json')


def pending():
    return list(AllowanceSuggestion.objects.filter(status='pending'))


# ── when a suggestion is made ─────────────────────────────────────────────────

def test_a_finished_lot_in_good_order_makes_a_suggestion_of_one_more_box(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor)
    assert harvest(auth_client, farmer, batch).status_code == 201
    [one] = pending()
    assert (one.farmer_id, one.cooperative_id, one.batch_id, one.old_boxes, one.suggested_boxes, one.status) == (farmer.pk, coop.pk, batch.pk, 2, 3, 'pending')


def test_a_batch_started_by_hand_makes_none(auth_client, coop):
    farmer = UserFactory(role='FARMER', cooperative=coop)
    batch = BatchFactory(farm=FarmFactory(owner=farmer), stage='COCOON')
    assert harvest(auth_client, farmer, batch).status_code == 201
    assert AllowanceSuggestion.objects.count() == 0


def test_a_farmer_who_did_not_use_all_of_their_allowance_gets_none(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor, boxes=2)
    allowance.set_as_admin(farmer, 5, 'Agreed with the cooperative', by=UserFactory(role='ADMIN'))
    harvest(auth_client, farmer, batch)
    assert AllowanceSuggestion.objects.count() == 0


def test_an_open_disease_alert_on_the_batch_stops_it_and_a_resolved_one_does_not(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor)
    alert = AlertLog.objects.create(batch=batch, type='DISEASE', message='Pebrine suspected')
    assert nudges.consider(batch) is None
    AlertLog.objects.filter(pk=alert.pk).update(resolved_at=timezone.now())
    assert nudges.consider(batch) is not None


def test_a_request_for_more_that_already_waits_stops_it(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor)
    allowance.ask(farmer, 4, 'I built a second house')
    assert nudges.consider(batch) is None


def test_the_room_must_have_space_for_one_more_box_when_its_size_is_known(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor, boxes=2, area='8', m2='4')
    assert nudges.consider(batch) is None
    other, other_batch = lot(coop, supervisor, boxes=2, area='12', m2='4')
    assert nudges.consider(other_batch).suggested_boxes == 3


def test_with_the_space_per_box_unknown_the_room_cap_is_not_applied(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor, boxes=2, area='8', m2=None)
    assert nudges.consider(batch).suggested_boxes == 3


def test_a_farmer_who_left_the_cooperative_gets_none(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor)
    farmer.cooperative = CooperativeFactory()
    farmer.save()
    assert nudges.consider(batch) is None


@pytest.mark.parametrize('boxes', [0, 100])
def test_an_allowance_of_zero_or_at_the_top_gets_none(coop, supervisor, boxes):
    farmer, batch = lot(coop, supervisor, boxes=2)
    allowance.set_as_admin(farmer, boxes, 'Set by an admin for this test', by=UserFactory(role='ADMIN'))
    EggRequest.objects.filter(batch=batch).update(boxes_received=max(boxes, 2))
    assert nudges.consider(batch) is None


def test_a_batch_gets_one_suggestion_even_when_harvests_are_recorded_twice(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor)
    harvest(auth_client, farmer, batch)
    harvest(auth_client, farmer, batch)
    assert AllowanceSuggestion.objects.count() == 1


def test_a_failure_inside_the_nudge_never_fails_the_harvest(auth_client, coop, supervisor, monkeypatch):
    farmer, batch = lot(coop, supervisor)

    def broken(*args, **kwargs):
        raise RuntimeError('boom')

    monkeypatch.setattr('supply.nudges._consider', broken)
    assert harvest(auth_client, farmer, batch).status_code == 201


# ── the supervisor's list ─────────────────────────────────────────────────────

def test_a_supervisor_lists_the_suggestions_of_their_cooperative_only(auth_client, coop, supervisor, outsider):
    farmer, batch = lot(coop, supervisor)
    nudges.consider(batch)
    data = auth_client(supervisor).get(LIST).json()['data']
    assert data['count'] == 1
    row = data['suggestions'][0]
    assert (row['currentBoxes'], row['suggestedBoxes'], row['farmer']['name'], row['batch']['lotCode']) == (2, 3, farmer.name, batch.lot_code)
    assert auth_client(outsider).get(LIST).json()['data']['count'] == 0


def test_a_farmer_cannot_read_the_list_and_an_admin_can(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor)
    nudges.consider(batch)
    assert auth_client(farmer).get(LIST).status_code == 403
    assert auth_client(UserFactory(role='ADMIN')).get(LIST).json()['data']['count'] == 1


def test_the_count_of_decisions_includes_the_suggestions(auth_client, coop, supervisor, outsider):
    farmer, batch = lot(coop, supervisor)
    nudges.consider(batch)
    assert auth_client(supervisor).get(COUNT).json()['data'] == {'count': 1, 'rooms': 0, 'allowance': 0, 'rounds': 0, 'nudges': 1}
    assert auth_client(outsider).get(COUNT).json()['data']['nudges'] == 0


# ── deciding ──────────────────────────────────────────────────────────────────

def decide(client, suggestion, decision):
    return client.post(f'{LIST}/{suggestion.pk}/decision', {'decision': decision}, format='json')


def test_approving_raises_the_allowance_by_one_with_a_history_line_and_one_friendly_mail(auth_client, coop, supervisor, sent):
    farmer, batch = lot(coop, supervisor)
    suggestion = nudges.consider(batch)
    assert decide(auth_client(supervisor), suggestion, 'approve').status_code == 200
    assert allowance.current(farmer)['boxes'] == 3
    change = AllowanceChange.objects.filter(kind='suggestion').get()
    assert (change.old_boxes, change.new_boxes, change.decided_by_id) == (2, 3, supervisor.pk)
    assert batch.lot_code in change.reason
    suggestion.refresh_from_db()
    assert (suggestion.status, suggestion.decided_by_id) == ('approved', supervisor.pk)
    assert [(subject, to) for subject, to, _ in sent] == [('Your allowance was raised', [farmer.email])]
    assert 'Well done' in sent[0][2].plain() and batch.lot_code in sent[0][2].plain()
    assert AuditLog.objects.filter(resource='AllowanceSuggestion', detail__contains='Approved').exists()


def test_approving_twice_raises_it_once(auth_client, coop, supervisor, sent):
    farmer, batch = lot(coop, supervisor)
    suggestion = nudges.consider(batch)
    decide(auth_client(supervisor), suggestion, 'approve')
    again = decide(auth_client(supervisor), suggestion, 'approve')
    assert (again.status_code, again.json()['code']) == (409, 'nothing_to_review')
    assert allowance.current(farmer)['boxes'] == 3 and len(sent) == 1


def test_an_allowance_that_moved_since_makes_the_suggestion_stale(auth_client, coop, supervisor, sent):
    farmer, batch = lot(coop, supervisor)
    suggestion = nudges.consider(batch)
    allowance.lower(farmer, 1, 'Outbreak last month', by=supervisor)
    response = decide(auth_client(supervisor), suggestion, 'approve')
    assert (response.status_code, response.json()['code']) == (409, 'stale')
    suggestion.refresh_from_db()
    assert suggestion.status == 'stale'
    assert allowance.current(farmer)['boxes'] == 1 and sent == []


def test_dismissing_changes_nothing_and_tells_nobody(auth_client, coop, supervisor, sent):
    farmer, batch = lot(coop, supervisor)
    suggestion = nudges.consider(batch)
    assert decide(auth_client(supervisor), suggestion, 'dismiss').status_code == 200
    suggestion.refresh_from_db()
    assert suggestion.status == 'dismissed'
    assert allowance.current(farmer)['boxes'] == 2 and sent == []
    assert nudges.consider(batch) is None


def test_a_bad_decision_word_is_a_400(auth_client, coop, supervisor):
    farmer, batch = lot(coop, supervisor)
    suggestion = nudges.consider(batch)
    response = decide(auth_client(supervisor), suggestion, 'maybe')
    assert (response.status_code, response.json()['code']) == (400, 'bad_decision')


def test_another_cooperatives_supervisor_gets_404_and_a_farmer_403(auth_client, coop, supervisor, outsider):
    farmer, batch = lot(coop, supervisor)
    suggestion = nudges.consider(batch)
    assert decide(auth_client(outsider), suggestion, 'approve').status_code == 404
    assert decide(auth_client(farmer), suggestion, 'approve').status_code == 403
    suggestion.refresh_from_db()
    assert suggestion.status == 'pending'


def test_an_unknown_suggestion_is_404(auth_client, supervisor):
    assert auth_client(supervisor).post(f'{LIST}/nope/decision', {'decision': 'approve'}, format='json').status_code == 404
