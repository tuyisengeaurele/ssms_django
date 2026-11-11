"""Supply rounds over HTTP: the supervisor manages them, farmers ask inside them, and the eggs are received."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from audit_log.models import AuditLog
from batches.models import Batch
from farms.models import RearingRoom
from supply import allowance
from supply.models import EggRequest, SupplyRound, SupplySettings
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

ROUNDS = '/api/supply/rounds'
CURRENT = '/api/supply/rounds/current'
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
def admin():
    return UserFactory(role='ADMIN')


def farmer_with_room(coop, boxes=3, area='20', m2='4'):
    settings = SupplySettings.for_cooperative(coop)
    settings.m2_per_box = Decimal(m2)
    settings.save()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    allowance.set_start(farmer, coop, boxes, by=None)
    room = RearingRoom.objects.create(farm=FarmFactory(owner=farmer), name='Room A', area_m2=Decimal(area))
    return farmer, room


def body(**over):
    base = {
        'name': 'November round', 'stockBoxes': 10, 'requestDeadline': (timezone.now() + timedelta(days=3)).isoformat(),
        'deliveryDate': (timezone.now() + timedelta(days=7)).date().isoformat(), 'deliveryPlace': 'Cooperative store',
        'expectedHarvestDate': (timezone.now() + timedelta(days=40)).date().isoformat(),
    }
    return {**base, **over}


def make(client, **over):
    response = client.post(ROUNDS, body(**over), format='json')
    assert response.status_code == 201, response.json()
    return response.json()['data']['id']


def act(client, round_id, action, **extra):
    return client.post(f'{ROUNDS}/{round_id}/action', {'action': action, **extra}, format='json')


def open_round(client, **over):
    round_id = make(client, **over)
    assert act(client, round_id, 'open').status_code == 200
    return round_id


def ask(client, round_id, room, boxes=2, **extra):
    return client.post(f'{ROUNDS}/{round_id}/requests', {'roomId': room.pk, 'boxes': boxes, **extra}, format='json')


def close_and_confirm(client, round_id, items=None):
    act(client, round_id, 'close')  # already closed is fine, a deadline may have closed it
    if items is None:
        rows = client.get(f'{ROUNDS}/{round_id}/proposal').json()['data']['requests']
        items = [{'id': r['id'], 'boxes': r['proposed']} for r in rows]
    return client.post(f'{ROUNDS}/{round_id}/confirm', {'items': items}, format='json')


# ── a supervisor makes and runs a round ───────────────────────────────────────

def test_a_supervisor_makes_a_draft_round_for_their_cooperative(auth_client, supervisor, coop):
    response = auth_client(supervisor).post(ROUNDS, body(), format='json')
    assert response.status_code == 201
    data = response.json()['data']
    assert (data['status'], data['stockBoxes'], data['lotCode'], data['deliveryPlace'], data['paused']) == ('draft', 10, None, 'Cooperative store', False)
    row = SupplyRound.objects.get()
    assert (row.cooperative_id, row.created_by_id) == (coop.pk, supervisor.pk)
    assert AuditLog.objects.filter(resource='SupplyRound', resource_id=row.pk, detail__contains='November round').exists()


@pytest.mark.parametrize('over', [{'name': ''}, {'stockBoxes': -1}, {'stockBoxes': 2.5}, {'deliveryPlace': ''}, {'requestDeadline': 'tomorrow'}, {'deliveryDate': 'x'}])
def test_a_round_with_bad_facts_is_refused_with_a_code(auth_client, supervisor, over):
    response = auth_client(supervisor).post(ROUNDS, body(**over), format='json')
    assert (response.status_code, response.json()['code']) == (422, 'bad_round')
    assert SupplyRound.objects.count() == 0


def test_a_farmer_cannot_make_or_list_rounds(auth_client, coop):
    farmer, _ = farmer_with_room(coop)
    client = auth_client(farmer)
    assert client.post(ROUNDS, body(), format='json').status_code == 403
    assert client.get(ROUNDS).status_code == 403


def test_an_admin_names_the_cooperative_to_make_a_round(auth_client, admin, coop):
    client = auth_client(admin)
    assert client.post(ROUNDS, body(), format='json').status_code == 422
    response = client.post(ROUNDS, body(cooperativeId=coop.pk), format='json')
    assert response.status_code == 201 and SupplyRound.objects.get().cooperative_id == coop.pk


def test_the_list_shows_only_the_rounds_of_the_cooperative_with_their_counts(auth_client, supervisor, outsider, coop):
    farmer, room = farmer_with_room(coop)
    mine = open_round(auth_client(supervisor))
    ask(auth_client(farmer), mine, room, 2)
    open_round(auth_client(outsider))
    rows = auth_client(supervisor).get(ROUNDS).json()['data']['rounds']
    assert [r['id'] for r in rows] == [mine]
    assert (rows[0]['requestCount'], rows[0]['status']) == (1, 'open')


def test_an_admin_lists_every_cooperatives_rounds(auth_client, admin, supervisor, outsider):
    open_round(auth_client(supervisor))
    open_round(auth_client(outsider))
    assert len(auth_client(admin).get(ROUNDS).json()['data']['rounds']) == 2


def test_the_detail_holds_the_round_and_its_requests(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    round_id = open_round(auth_client(supervisor))
    ask(auth_client(farmer), round_id, room, 2, note='For the new house')
    data = auth_client(supervisor).get(f'{ROUNDS}/{round_id}').json()['data']
    assert data['round']['id'] == round_id
    request = data['requests'][0]
    assert (request['boxesAsked'], request['status'], request['note'], request['farmer']['name'], request['room']['name']) == (2, 'submitted', 'For the new house', farmer.name, 'Room A')


def test_another_cooperatives_supervisor_gets_404_on_everything_about_a_round(auth_client, supervisor, outsider, coop):
    round_id = open_round(auth_client(supervisor))
    client = auth_client(outsider)
    assert client.get(f'{ROUNDS}/{round_id}').status_code == 404
    assert client.patch(f'{ROUNDS}/{round_id}', {'name': 'Mine now'}, format='json').status_code == 404
    assert act(client, round_id, 'cancel', note='Not yours').status_code == 404
    assert client.get(f'{ROUNDS}/{round_id}/proposal').status_code == 404
    assert client.post(f'{ROUNDS}/{round_id}/confirm', {'items': []}, format='json').status_code == 404
    assert SupplyRound.objects.get().status == 'open'


def test_a_draft_is_edited_then_opened_and_gets_its_lot_code(auth_client, supervisor):
    client = auth_client(supervisor)
    round_id = make(client)
    assert client.patch(f'{ROUNDS}/{round_id}', {'name': 'Renamed', 'stockBoxes': 8}, format='json').status_code == 200
    opened = act(client, round_id, 'open')
    assert opened.status_code == 200
    data = opened.json()['data']
    assert (data['name'], data['stockBoxes'], data['status']) == ('Renamed', 8, 'open')
    assert data['lotCode'].startswith('L')
    again = act(client, round_id, 'open')
    assert (again.status_code, again.json()['code']) == (409, 'not_a_draft')
    assert AuditLog.objects.filter(resource='SupplyRound', resource_id=round_id, detail__contains='Opened').exists()


def test_a_bad_edit_and_an_unknown_action_are_refused(auth_client, supervisor):
    client = auth_client(supervisor)
    round_id = make(client)
    assert client.patch(f'{ROUNDS}/{round_id}', {'stockBoxes': 'lots'}, format='json').json()['code'] == 'bad_round'
    assert act(client, round_id, 'explode').status_code == 400


def test_pausing_and_resuming(auth_client, supervisor):
    client = auth_client(supervisor)
    round_id = open_round(client)
    assert act(client, round_id, 'pause').json()['data']['paused'] is True
    assert act(client, round_id, 'resume').json()['data']['paused'] is False


def test_cancelling_needs_a_reason_and_cancels_the_waiting_requests(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    client = auth_client(supervisor)
    round_id = open_round(client)
    ask(auth_client(farmer), round_id, room, 2)
    assert act(client, round_id, 'cancel').json()['code'] == 'note_required'
    assert act(client, round_id, 'cancel', note='No eggs this month').status_code == 200
    assert (SupplyRound.objects.get().status, EggRequest.objects.get().status) == ('cancelled', 'cancelled')
    assert AuditLog.objects.filter(resource='SupplyRound', detail__contains='No eggs this month').exists()


# ── a farmer sees the round and asks ──────────────────────────────────────────

def test_a_farmer_with_no_round_sees_none(auth_client, coop):
    farmer, _ = farmer_with_room(coop)
    data = auth_client(farmer).get(CURRENT).json()['data']
    assert data == {'round': None, 'myRequest': None, 'rooms': []}


def test_a_draft_round_is_not_shown_to_farmers(auth_client, supervisor, coop):
    farmer, _ = farmer_with_room(coop)
    make(auth_client(supervisor))
    assert auth_client(farmer).get(CURRENT).json()['data']['round'] is None


def test_an_open_round_comes_with_the_limit_for_each_approved_room(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop, boxes=2)
    RearingRoom.objects.create(farm=room.farm, name='Waiting', area_m2=Decimal('40'), approval_status='pending')
    round_id = open_round(auth_client(supervisor))
    data = auth_client(farmer).get(CURRENT).json()['data']
    assert data['round']['id'] == round_id and data['round']['status'] == 'open'
    assert data['myRequest'] is None
    assert [(r['name'], r['limit'], r['allowance'], r['roomFree'], r['stock'], r['binding']) for r in data['rooms']] == [('Room A', 2, 2, 5, 10, 'allowance')]


def test_the_round_of_another_cooperative_is_not_shown(auth_client, outsider, coop):
    farmer, _ = farmer_with_room(coop)
    open_round(auth_client(outsider))
    assert auth_client(farmer).get(CURRENT).json()['data']['round'] is None


def test_a_farmer_asks_and_then_sees_their_request(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    round_id = open_round(auth_client(supervisor))
    client = auth_client(farmer)
    response = ask(client, round_id, room, 2, note='For the new house')
    assert response.status_code == 201
    data = client.get(CURRENT).json()['data']
    assert (data['myRequest']['boxesAsked'], data['myRequest']['status'], data['myRequest']['note']) == (2, 'submitted', 'For the new house')
    assert AuditLog.objects.filter(resource='EggRequest', detail__contains='Asked for 2 boxes').exists()


@pytest.mark.parametrize('boxes,code', [(4, 'over_limit'), (0, 'bad_boxes'), ('x', 'bad_boxes')])
def test_a_bad_request_is_refused_with_a_code(auth_client, supervisor, coop, boxes, code):
    farmer, room = farmer_with_room(coop, boxes=3)
    round_id = open_round(auth_client(supervisor))
    response = ask(auth_client(farmer), round_id, room, boxes)
    assert (response.status_code, response.json()['code']) == (422, code)
    assert EggRequest.objects.count() == 0


def test_the_refusal_above_the_limit_says_what_the_limit_is(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop, boxes=2)
    round_id = open_round(auth_client(supervisor))
    assert 'up to 2 boxes. Your allowance is 2.' in ask(auth_client(farmer), round_id, room, 3).json()['message']


def test_a_second_request_in_a_round_is_a_409(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    round_id = open_round(auth_client(supervisor))
    client = auth_client(farmer)
    ask(client, round_id, room, 1)
    again = ask(client, round_id, room, 1)
    assert (again.status_code, again.json()['code']) == (409, 'request_exists')


def test_a_request_after_the_deadline_is_a_409(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    round_id = open_round(auth_client(supervisor))
    SupplyRound.objects.update(request_deadline=timezone.now() - timedelta(minutes=1))
    response = ask(auth_client(farmer), round_id, room, 1)
    assert (response.status_code, response.json()['code']) == (409, 'deadline_passed')


def test_a_room_that_is_not_approved_or_not_theirs_is_refused(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    other, other_room = farmer_with_room(coop)
    round_id = open_round(auth_client(supervisor))
    client = auth_client(farmer)
    assert ask(client, round_id, other_room, 1).status_code == 404
    RearingRoom.objects.filter(pk=room.pk).update(approval_status='pending')
    refused = ask(client, round_id, room, 1)
    assert (refused.status_code, refused.json()['code']) == (422, 'room_not_approved')


def test_a_farmer_of_another_cooperative_cannot_ask_and_staff_cannot_ask(auth_client, supervisor, outsider, coop):
    farmer, room = farmer_with_room(coop)
    round_id = open_round(auth_client(supervisor))
    far, far_room = farmer_with_room(CooperativeFactory())
    assert ask(auth_client(far), round_id, far_room, 1).status_code == 404
    assert ask(auth_client(supervisor), round_id, room, 1).status_code == 403


def test_the_owner_cancels_a_request_and_nobody_else_can(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    other, _ = farmer_with_room(coop)
    round_id = open_round(auth_client(supervisor))
    request_id = ask(auth_client(farmer), round_id, room, 1).json()['data']['id']
    assert auth_client(other).delete(f'/api/supply/requests/{request_id}').status_code == 404
    assert auth_client(supervisor).delete(f'/api/supply/requests/{request_id}').status_code == 403
    assert auth_client(farmer).delete(f'/api/supply/requests/{request_id}').status_code == 200
    again = auth_client(farmer).delete(f'/api/supply/requests/{request_id}')
    assert (again.status_code, again.json()['code']) == (409, 'nothing_to_cancel')


# ── the split ─────────────────────────────────────────────────────────────────

def test_the_proposal_waits_for_the_close_and_then_lists_every_request(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    client = auth_client(supervisor)
    round_id = open_round(client)
    ask(auth_client(farmer), round_id, room, 2)
    early = client.get(f'{ROUNDS}/{round_id}/proposal')
    assert (early.status_code, early.json()['code']) == (409, 'not_closed')
    act(client, round_id, 'close')
    data = client.get(f'{ROUNDS}/{round_id}/proposal').json()['data']
    row = data['requests'][0]
    assert (data['stock'], row['asked'], row['proposed'], row['allowance'], row['roomFree'], row['farmer']['name']) == (10, 2, 2, 3, 5, farmer.name)
    assert data['total'] == 2


def test_confirming_decides_every_request_and_each_farmer_sees_the_result(auth_client, supervisor, coop):
    first, room_one = farmer_with_room(coop, boxes=3)
    second, room_two = farmer_with_room(coop, boxes=3)
    client = auth_client(supervisor)
    round_id = open_round(client, stockBoxes=3)
    ask(auth_client(first), round_id, room_one, 2)
    ask(auth_client(second), round_id, room_two, 2)
    response = close_and_confirm(client, round_id)
    assert response.status_code == 200
    one = auth_client(first).get(CURRENT).json()['data']['myRequest']
    two = auth_client(second).get(CURRENT).json()['data']['myRequest']
    assert [(one['status'], one['boxesApproved']), (two['status'], two['boxesApproved'])] == [('approved', 2), ('part_approved', 1)]
    assert AuditLog.objects.filter(resource='SupplyRound', detail__contains='Confirmed the split').exists()


def test_confirming_over_the_stock_or_twice_is_refused(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop, boxes=3)
    client = auth_client(supervisor)
    round_id = open_round(client, stockBoxes=1)
    request_id = ask(auth_client(farmer), round_id, room, 1).json()['data']['id']
    act(client, round_id, 'close')
    over = client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': request_id, 'boxes': 2}]}, format='json')
    assert over.json()['code'] in ('over_asked', 'over_stock') and over.status_code == 422
    ok = client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': request_id, 'boxes': 1}]}, format='json')
    assert ok.status_code == 200
    twice = client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': request_id, 'boxes': 1}]}, format='json')
    assert (twice.status_code, twice.json()['code']) == (409, 'already_allocated')


def test_a_decline_note_with_markup_is_kept_as_text(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    client = auth_client(supervisor)
    round_id = open_round(client)
    request_id = ask(auth_client(farmer), round_id, room, 1).json()['data']['id']
    act(client, round_id, 'close')
    client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': request_id, 'boxes': 0, 'declineNote': '<b>no</b>'}]}, format='json')
    assert EggRequest.objects.get().decision_note == '<b>no</b>' and EggRequest.objects.get().status == 'declined'


def test_the_count_of_decisions_includes_a_round_to_split(auth_client, supervisor, outsider, coop):
    farmer, room = farmer_with_room(coop)
    client = auth_client(supervisor)
    round_id = open_round(client)
    ask(auth_client(farmer), round_id, room, 1)
    assert client.get(COUNT).json()['data'] == {'count': 0, 'rooms': 0, 'allowance': 0, 'rounds': 0, 'nudges': 0}
    act(client, round_id, 'close')
    assert client.get(COUNT).json()['data'] == {'count': 1, 'rooms': 0, 'allowance': 0, 'rounds': 1, 'nudges': 0}
    assert auth_client(outsider).get(COUNT).json()['data']['rounds'] == 0
    close_and_confirm(client, round_id)
    assert client.get(COUNT).json()['data']['count'] == 0


def test_a_round_past_its_deadline_counts_without_being_closed_by_hand(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    client = auth_client(supervisor)
    round_id = open_round(client)
    ask(auth_client(farmer), round_id, room, 1)
    SupplyRound.objects.update(request_deadline=timezone.now() - timedelta(minutes=1))
    assert client.get(COUNT).json()['data']['rounds'] == 1
    assert client.get(f'{ROUNDS}/{round_id}').json()['data']['round']['status'] == 'closed'


# ── receiving ─────────────────────────────────────────────────────────────────

def delivering(auth_client, supervisor, coop, boxes=3):
    farmer, room = farmer_with_room(coop, boxes=boxes)
    client = auth_client(supervisor)
    round_id = open_round(client)
    request_id = ask(auth_client(farmer), round_id, room, boxes).json()['data']['id']
    assert close_and_confirm(client, round_id).status_code == 200
    return farmer, room, round_id, request_id


def test_the_farmer_confirms_receipt_and_the_batch_appears_with_the_lot_code(auth_client, supervisor, coop):
    farmer, room, round_id, request_id = delivering(auth_client, supervisor, coop)
    response = auth_client(farmer).post(f'/api/supply/requests/{request_id}/receipt', {'boxes': 3, 'condition': 'good'}, format='json')
    assert response.status_code == 201
    batch = Batch.objects.get()
    assert (batch.room_id, batch.stage, batch.quantity, batch.lot_code) == (room.pk, 'EGG', 3, SupplyRound.objects.get().lot_code)
    assert response.json()['data']['batchId'] == batch.pk
    assert AuditLog.objects.filter(resource='EggRequest', resource_id=request_id, detail__contains='Received').exists()
    assert SupplyRound.objects.get().status == 'done'


def test_a_supervisor_records_the_receipt_for_the_farmer_and_it_says_who(auth_client, supervisor, coop):
    farmer, room, round_id, request_id = delivering(auth_client, supervisor, coop)
    response = auth_client(supervisor).post(f'/api/supply/requests/{request_id}/receipt', {'boxes': 2, 'condition': 'damaged'}, format='json')
    assert response.status_code == 201
    request = EggRequest.objects.get()
    assert (request.received_by_id, request.boxes_received, request.condition) == (supervisor.pk, 2, 'damaged')
    assert AuditLog.objects.filter(resource='EggRequest', detail__contains='for ' + farmer.name).exists()


def test_receipt_is_out_of_reach_for_others(auth_client, supervisor, outsider, coop):
    farmer, room, round_id, request_id = delivering(auth_client, supervisor, coop)
    other, _ = farmer_with_room(coop)
    url = f'/api/supply/requests/{request_id}/receipt'
    assert auth_client(outsider).post(url, {'boxes': 1, 'condition': 'good'}, format='json').status_code == 404
    assert auth_client(other).post(url, {'boxes': 1, 'condition': 'good'}, format='json').status_code == 404
    assert Batch.objects.count() == 0


def test_a_second_receipt_is_a_409_and_makes_no_second_batch(auth_client, supervisor, coop):
    farmer, room, round_id, request_id = delivering(auth_client, supervisor, coop)
    url = f'/api/supply/requests/{request_id}/receipt'
    auth_client(farmer).post(url, {'boxes': 3, 'condition': 'good'}, format='json')
    again = auth_client(supervisor).post(url, {'boxes': 3, 'condition': 'good'}, format='json')
    assert (again.status_code, again.json()['code']) == (409, 'already_received')
    assert Batch.objects.count() == 1


def test_receipt_in_a_paused_round_and_above_the_promise_are_refused(auth_client, supervisor, coop):
    farmer, room, round_id, request_id = delivering(auth_client, supervisor, coop)
    url = f'/api/supply/requests/{request_id}/receipt'
    over = auth_client(farmer).post(url, {'boxes': 4, 'condition': 'good'}, format='json')
    assert over.json()['code'] == 'over_approved'
    act(auth_client(supervisor), round_id, 'pause')
    paused = auth_client(farmer).post(url, {'boxes': 3, 'condition': 'good'}, format='json')
    assert (paused.status_code, paused.json()['code']) == (409, 'round_paused')


def test_the_supervisor_marks_eggs_not_collected(auth_client, supervisor, outsider, coop):
    farmer, room, round_id, request_id = delivering(auth_client, supervisor, coop)
    url = f'/api/supply/requests/{request_id}/not-collected'
    assert auth_client(outsider).post(url).status_code == 404
    assert auth_client(farmer).post(url).status_code == 403
    assert auth_client(supervisor).post(url).status_code == 200
    assert EggRequest.objects.get().status == 'not_collected'
    assert SupplyRound.objects.get().status == 'done'


def test_the_current_round_after_the_split_shows_the_delivery_and_the_request(auth_client, supervisor, coop):
    farmer, room, round_id, request_id = delivering(auth_client, supervisor, coop)
    data = auth_client(farmer).get(CURRENT).json()['data']
    assert (data['round']['status'], data['myRequest']['status'], data['myRequest']['boxesApproved']) == ('allocated', 'approved', 3)
    assert data['round']['deliveryPlace'] == 'Cooperative store'


def test_eggs_waiting_to_be_received_come_before_a_newer_request_in_another_round(auth_client, supervisor, coop):
    """Rounds overlap: one hands out eggs while the next takes requests. The card must not hide the eggs a farmer has to collect."""
    farmer, room, first_round, first_request = delivering(auth_client, supervisor, coop, boxes=2)
    second_room = RearingRoom.objects.create(farm=room.farm, name='Room B', area_m2=Decimal('20'))
    client = auth_client(supervisor)
    second_round = open_round(client, name='December round')
    assert ask(auth_client(farmer), second_round, second_room, 1).status_code == 201
    data = auth_client(farmer).get(CURRENT).json()['data']
    assert data['round']['id'] == first_round
    assert (data['myRequest']['id'], data['myRequest']['status']) == (first_request, 'approved')


def test_with_nothing_to_collect_the_newest_request_is_the_one_shown(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    second_room = RearingRoom.objects.create(farm=room.farm, name='Room B', area_m2=Decimal('20'))
    client = auth_client(supervisor)
    first_round = open_round(client, name='November round')
    assert ask(auth_client(farmer), first_round, room, 1).status_code == 201
    second_round = open_round(client, name='December round')
    assert ask(auth_client(farmer), second_round, second_room, 1).status_code == 201
    assert auth_client(farmer).get(CURRENT).json()['data']['round']['id'] == second_round


def test_once_the_eggs_are_received_a_newer_request_takes_the_card(auth_client, supervisor, coop):
    farmer, room, first_round, first_request = delivering(auth_client, supervisor, coop, boxes=2)
    assert auth_client(farmer).post(f'/api/supply/requests/{first_request}/receipt', {'boxes': 2, 'condition': 'good'}, format='json').status_code == 201
    second_room = RearingRoom.objects.create(farm=room.farm, name='Room B', area_m2=Decimal('20'))
    second_round = open_round(auth_client(supervisor), name='December round')
    assert ask(auth_client(farmer), second_round, second_room, 1).status_code == 201
    assert auth_client(farmer).get(CURRENT).json()['data']['round']['id'] == second_round


def test_a_received_request_is_still_shown_while_the_round_has_other_eggs_to_hand_out(auth_client, supervisor, coop):
    farmer, room = farmer_with_room(coop)
    other, other_room = farmer_with_room(coop)
    client = auth_client(supervisor)
    round_id = open_round(client)
    mine = ask(auth_client(farmer), round_id, room, 2).json()['data']['id']
    ask(auth_client(other), round_id, other_room, 2)
    assert close_and_confirm(client, round_id).status_code == 200
    auth_client(farmer).post(f'/api/supply/requests/{mine}/receipt', {'boxes': 2, 'condition': 'good'}, format='json')
    assert auth_client(farmer).get(CURRENT).json()['data']['myRequest']['status'] == 'received'
