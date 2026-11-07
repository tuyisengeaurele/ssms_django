"""The allowance over HTTP: the farmer's card and requests, the supervisor's decisions, and the cooperative's settings."""
from decimal import Decimal

import pytest

from audit_log.models import AuditLog
from farms.models import RearingRoom
from supply import allowance
from supply.models import Allowance, AllowanceChange, AllowanceRequest, SupplySettings
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

CARD = '/api/supply/allowance'
REQUESTS = '/api/supply/allowance/requests'
SETTINGS = '/api/supply/settings'


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')


@pytest.fixture
def farmer(coop):
    return UserFactory(role='FARMER', cooperative=coop, name='Aline Uwase')


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN')


@pytest.fixture
def outsider():
    """A supervisor of another cooperative, who must see nothing here."""
    return UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())


def ask(client, boxes=4, reason='I built a second house'):
    return client.post(REQUESTS, {'boxesAsked': boxes, 'reason': reason}, format='json')


def decide(client, request_id, **body):
    return client.post(f'{REQUESTS}/{request_id}/decision', body, format='json')


def set_farmer(client, farmer_id, **body):
    return client.patch(f'/api/supply/allowance/farmers/{farmer_id}', body, format='json')


# ── the farmer's card ─────────────────────────────────────────────────────────

def test_a_new_farmer_sees_the_cooperative_default(auth_client, farmer, coop):
    SupplySettings.objects.create(cooperative=coop, starter_boxes=3)
    data = auth_client(farmer).get(CARD).json()['data']
    assert (data['boxes'], data['source'], data['since']) == (3, 'default', None)
    assert (data['history'], data['openRequest'], data['capacityBoxes'], data['starterBoxes']) == ([], None, None, 3)


def test_the_card_shows_history_newest_first_with_who_and_why(auth_client, farmer, supervisor, coop):
    allowance.set_start(farmer, coop, 3, by=supervisor)
    allowance.lower(farmer, 1, 'Outbreak last month', by=supervisor)
    data = auth_client(farmer).get(CARD).json()['data']
    assert (data['boxes'], data['source']) == (1, 'set')
    first = data['history'][0]
    assert (first['kind'], first['oldBoxes'], first['newBoxes'], first['reason'], first['byName']) == ('reduction', 3, 1, 'Outbreak last month', 'Claire Uwimana')
    assert data['history'][1]['kind'] == 'start'


def test_the_card_shows_the_open_request_and_the_room_capacity_when_known(auth_client, farmer, coop):
    SupplySettings.objects.create(cooperative=coop, m2_per_box=Decimal('4'))
    RearingRoom.objects.create(farm=FarmFactory(owner=farmer), name='A', area_m2=Decimal('12'))
    client = auth_client(farmer)
    request_id = ask(client).json()['data']['id']
    data = client.get(CARD).json()['data']
    assert data['capacityBoxes'] == 3
    assert (data['openRequest']['id'], data['openRequest']['boxesAsked'], data['openRequest']['reason']) == (request_id, 4, 'I built a second house')


def test_a_farmer_in_no_cooperative_sees_nothing_to_take(auth_client):
    data = auth_client(UserFactory(role='FARMER', cooperative=None)).get(CARD).json()['data']
    assert (data['boxes'], data['source']) == (0, 'none')


def test_only_a_farmer_has_a_card(auth_client, supervisor, admin):
    assert auth_client(supervisor).get(CARD).status_code == 403
    assert auth_client(admin).get(CARD).status_code == 403


# ── asking and withdrawing ────────────────────────────────────────────────────

def test_a_farmer_asks_and_the_request_waits(auth_client, farmer, coop):
    response = ask(auth_client(farmer))
    assert response.status_code == 201
    row = AllowanceRequest.objects.get()
    assert (row.farmer_id, row.cooperative_id, row.boxes_asked, row.status) == (farmer.pk, coop.pk, 4, 'requested')
    assert AuditLog.objects.filter(resource='AllowanceRequest', resource_id=row.pk, detail__contains='Asked for 4 boxes').exists()


@pytest.mark.parametrize('body,code', [
    ({'boxesAsked': 101, 'reason': 'I built a second house'}, 'bad_boxes'),
    ({'boxesAsked': 2.5, 'reason': 'I built a second house'}, 'bad_boxes'),
    ({'boxesAsked': 'x', 'reason': 'I built a second house'}, 'bad_boxes'),
    ({'reason': 'I built a second house'}, 'bad_boxes'),
    ({'boxesAsked': 4, 'reason': 'short'}, 'reason_needed'),
    ({'boxesAsked': 4}, 'reason_needed'),
])
def test_a_bad_request_is_refused_with_a_code(auth_client, farmer, body, code):
    response = auth_client(farmer).post(REQUESTS, body, format='json')
    assert (response.status_code, response.json()['code']) == (422, code)
    assert AllowanceRequest.objects.count() == 0


def test_asking_for_the_current_amount_or_twice_is_refused(auth_client, farmer, coop):
    client = auth_client(farmer)
    current = allowance.current(farmer)['boxes']
    assert ask(client, boxes=current).json()['code'] == 'same_amount'
    assert ask(client, boxes=current + 2).status_code == 201
    second = ask(client, boxes=current + 3)
    assert (second.status_code, second.json()['code']) == (409, 'request_open')


def test_a_farmer_in_no_cooperative_cannot_ask(auth_client):
    response = ask(auth_client(UserFactory(role='FARMER', cooperative=None)))
    assert (response.status_code, response.json()['code']) == (409, 'not_in_cooperative')


def test_staff_cannot_ask(auth_client, supervisor, admin):
    assert ask(auth_client(supervisor)).status_code == 403
    assert ask(auth_client(admin)).status_code == 403


def test_the_owner_withdraws_and_nobody_else_can(auth_client, farmer, coop, supervisor):
    request_id = ask(auth_client(farmer)).json()['data']['id']
    other = UserFactory(role='FARMER', cooperative=coop)
    assert auth_client(other).delete(f'{REQUESTS}/{request_id}').status_code == 404
    assert auth_client(supervisor).delete(f'{REQUESTS}/{request_id}').status_code == 403
    assert auth_client(farmer).delete(f'{REQUESTS}/{request_id}').status_code == 200
    assert AllowanceRequest.objects.get().status == 'withdrawn'
    assert AuditLog.objects.filter(resource='AllowanceRequest', detail__contains='Withdrew').exists()
    again = auth_client(farmer).delete(f'{REQUESTS}/{request_id}')
    assert (again.status_code, again.json()['code']) == (409, 'nothing_to_withdraw')


# ── the supervisor's list ─────────────────────────────────────────────────────

def test_a_supervisor_lists_the_open_requests_of_their_cooperative_only(auth_client, farmer, supervisor, outsider, coop):
    ask(auth_client(farmer), boxes=5)
    far = UserFactory(role='FARMER', cooperative=outsider.cooperative)
    ask(auth_client(far), boxes=6)
    data = auth_client(supervisor).get(REQUESTS).json()['data']
    assert data['count'] == 1
    row = data['requests'][0]
    assert (row['boxesAsked'], row['currentBoxes'], row['reason']) == (5, allowance.current(farmer)['boxes'], 'I built a second house')
    assert row['farmer'] == {'id': farmer.pk, 'name': 'Aline Uwase', 'email': farmer.email}
    assert auth_client(outsider).get(REQUESTS).json()['data']['count'] == 1


def test_a_decided_request_leaves_the_list(auth_client, farmer, supervisor):
    request_id = ask(auth_client(farmer)).json()['data']['id']
    decide(auth_client(supervisor), request_id, decision='approve')
    assert auth_client(supervisor).get(REQUESTS).json()['data']['count'] == 0


def test_an_admin_sees_all_and_may_narrow_to_one_cooperative(auth_client, farmer, outsider, admin, coop):
    ask(auth_client(farmer))
    ask(auth_client(UserFactory(role='FARMER', cooperative=outsider.cooperative)))
    client = auth_client(admin)
    assert client.get(REQUESTS).json()['data']['count'] == 2
    assert client.get(f'{REQUESTS}?cooperativeId={coop.pk}').json()['data']['count'] == 1


def test_a_farmer_cannot_read_the_staff_list(auth_client, farmer):
    assert auth_client(farmer).get(REQUESTS).status_code == 403


# ── deciding ──────────────────────────────────────────────────────────────────

def test_a_supervisor_approves_the_amount_asked(auth_client, farmer, supervisor):
    request_id = ask(auth_client(farmer), boxes=5).json()['data']['id']
    response = decide(auth_client(supervisor), request_id, decision='approve')
    assert response.status_code == 200
    assert allowance.current(farmer)['boxes'] == 5
    assert AuditLog.objects.filter(resource='AllowanceRequest', resource_id=request_id, detail__contains='Approved').exists()


def test_a_supervisor_may_grant_another_amount(auth_client, farmer, supervisor):
    request_id = ask(auth_client(farmer), boxes=6).json()['data']['id']
    decide(auth_client(supervisor), request_id, decision='approve', boxes=3, note='Three for now')
    row = AllowanceRequest.objects.get()
    assert (row.boxes_granted, row.decision_note) == (3, 'Three for now')
    assert allowance.current(farmer)['boxes'] == 3


def test_a_decline_needs_a_reason_and_changes_nothing(auth_client, farmer, supervisor):
    request_id = ask(auth_client(farmer)).json()['data']['id']
    before = allowance.current(farmer)['boxes']
    missing = decide(auth_client(supervisor), request_id, decision='decline')
    assert (missing.status_code, missing.json()['code']) == (422, 'note_required')
    assert decide(auth_client(supervisor), request_id, decision='decline', note='Not this season').status_code == 200
    assert allowance.current(farmer)['boxes'] == before
    assert AuditLog.objects.filter(resource='AllowanceRequest', detail__contains='Not this season').exists()


def test_a_bad_decision_word_is_a_400(auth_client, farmer, supervisor):
    request_id = ask(auth_client(farmer)).json()['data']['id']
    response = decide(auth_client(supervisor), request_id, decision='maybe')
    assert (response.status_code, response.json()['code']) == (400, 'bad_decision')


def test_the_second_supervisor_gets_a_409(auth_client, farmer, supervisor, coop):
    other = UserFactory(role='SUPERVISOR', cooperative=coop)
    request_id = ask(auth_client(farmer)).json()['data']['id']
    assert decide(auth_client(supervisor), request_id, decision='approve').status_code == 200
    late = decide(auth_client(other), request_id, decision='decline', note='Too late')
    assert (late.status_code, late.json()['code']) == (409, 'nothing_to_review')


def test_a_supervisor_of_another_cooperative_gets_404_and_nothing_changes(auth_client, farmer, outsider):
    request_id = ask(auth_client(farmer)).json()['data']['id']
    assert decide(auth_client(outsider), request_id, decision='approve').status_code == 404
    assert AllowanceRequest.objects.get().status == 'requested'


def test_a_farmer_cannot_decide_even_their_own_request(auth_client, farmer):
    client = auth_client(farmer)
    request_id = ask(client).json()['data']['id']
    assert decide(client, request_id, decision='approve').status_code == 403
    assert allowance.current(farmer)['boxes'] != 4


def test_an_admin_decides_for_any_cooperative(auth_client, farmer, admin):
    request_id = ask(auth_client(farmer)).json()['data']['id']
    assert decide(auth_client(admin), request_id, decision='approve').status_code == 200


def test_an_unknown_request_is_404(auth_client, supervisor):
    assert decide(auth_client(supervisor), 'nope', decision='approve').status_code == 404


# ── changing a farmer's amount directly ───────────────────────────────────────

def test_a_supervisor_lowers_with_a_reason(auth_client, farmer, supervisor, coop):
    allowance.set_start(farmer, coop, 3, by=None)
    response = set_farmer(auth_client(supervisor), farmer.pk, boxes=1, reason='Outbreak last month')
    assert response.status_code == 200
    assert response.json()['data']['boxes'] == 1
    assert AllowanceChange.objects.filter(kind='reduction', reason='Outbreak last month').exists()
    assert AuditLog.objects.filter(resource='Allowance', detail__contains='Lowered').exists()


def test_a_supervisor_cannot_raise(auth_client, farmer, supervisor, coop):
    allowance.set_start(farmer, coop, 3, by=None)
    response = set_farmer(auth_client(supervisor), farmer.pk, boxes=5, reason='More space now')
    assert (response.status_code, response.json()['code']) == (422, 'cannot_raise')


def test_the_reason_is_needed(auth_client, farmer, supervisor, coop):
    allowance.set_start(farmer, coop, 3, by=None)
    assert set_farmer(auth_client(supervisor), farmer.pk, boxes=1, reason='short').json()['code'] == 'reason_needed'


def test_an_admin_may_set_any_amount(auth_client, farmer, admin, coop):
    allowance.set_start(farmer, coop, 3, by=None)
    assert set_farmer(auth_client(admin), farmer.pk, boxes=8, reason='Agreed with the cooperative').status_code == 200
    assert allowance.current(farmer)['boxes'] == 8


def test_a_farmer_of_another_cooperative_or_a_non_farmer_is_404(auth_client, outsider, supervisor, coop):
    far = UserFactory(role='FARMER', cooperative=outsider.cooperative)
    assert set_farmer(auth_client(supervisor), far.pk, boxes=1, reason='Outbreak last month').status_code == 404
    assert set_farmer(auth_client(supervisor), supervisor.pk, boxes=1, reason='Outbreak last month').status_code == 404
    assert Allowance.objects.count() == 0


def test_a_farmer_cannot_change_any_amount(auth_client, farmer, coop):
    other = UserFactory(role='FARMER', cooperative=coop)
    assert set_farmer(auth_client(farmer), other.pk, boxes=9, reason='I would like more').status_code == 403
    assert set_farmer(auth_client(farmer), farmer.pk, boxes=9, reason='I would like more').status_code == 403


# ── the cooperative's settings ────────────────────────────────────────────────

def test_a_supervisor_reads_their_own_settings_and_cannot_change_them(auth_client, supervisor, coop):
    SupplySettings.objects.create(cooperative=coop, starter_boxes=4, m2_per_box=Decimal('3.5'))
    client = auth_client(supervisor)
    data = client.get(SETTINGS).json()['data']
    assert (data['starterBoxes'], data['m2PerBox']) == (4, 3.5)
    assert client.patch(SETTINGS, {'starterBoxes': 9}, format='json').status_code == 403


def test_an_admin_names_the_cooperative_and_edits_the_settings(auth_client, admin, coop):
    client = auth_client(admin)
    assert client.get(SETTINGS).status_code == 422
    response = client.patch(SETTINGS, {'cooperativeId': coop.pk, 'starterBoxes': 3, 'm2PerBox': 4}, format='json')
    assert response.status_code == 200
    row = SupplySettings.objects.get()
    assert (row.starter_boxes, row.m2_per_box) == (3, Decimal('4.00'))
    assert AuditLog.objects.filter(resource='SupplySettings', detail__contains='Changed').exists()


def test_space_per_box_can_be_cleared_back_to_not_known(auth_client, admin, coop):
    SupplySettings.objects.create(cooperative=coop, m2_per_box=Decimal('4'))
    auth_client(admin).patch(SETTINGS, {'cooperativeId': coop.pk, 'm2PerBox': None}, format='json')
    assert SupplySettings.objects.get().m2_per_box is None


@pytest.mark.parametrize('body', [
    {'starterBoxes': 101}, {'starterBoxes': -1}, {'starterBoxes': 2.5}, {'starterBoxes': 'x'},
    {'m2PerBox': 0}, {'m2PerBox': -3}, {'m2PerBox': 'x'}, {'m2PerBox': 1001}, {'m2PerBox': 2.555},
])
def test_bad_settings_are_refused(auth_client, admin, coop, body):
    response = auth_client(admin).patch(SETTINGS, {'cooperativeId': coop.pk, **body}, format='json')
    assert response.status_code == 422
    assert SupplySettings.objects.filter(cooperative=coop).count() in (0, 1)
    assert not SupplySettings.objects.filter(cooperative=coop, starter_boxes__gt=50).exists()


def test_a_farmer_cannot_read_the_settings(auth_client, farmer):
    assert auth_client(farmer).get(SETTINGS).status_code == 403


def test_a_supervisor_without_a_cooperative_is_told_so(auth_client):
    assert auth_client(UserFactory(role='SUPERVISOR', cooperative=None)).get(SETTINGS).status_code == 403
