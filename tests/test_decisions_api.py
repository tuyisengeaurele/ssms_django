"""What waits for a decision, counted in one place, and the evidence behind one farmer's allowance request."""
from decimal import Decimal

import pytest

from farms.models import RearingRoom
from supply import allowance
from supply.models import SupplySettings
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

COUNT = '/api/team/decisions'
Approval = RearingRoom.Approval


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
def outsider():
    return UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())


def room(owner, name='Room A', **fields):
    fields.setdefault('area_m2', Decimal('12'))
    return RearingRoom.objects.create(farm=FarmFactory(owner=owner), name=name, **fields)


# ── the count ─────────────────────────────────────────────────────────────────

def test_the_count_adds_new_rooms_size_changes_and_requests(auth_client, supervisor, farmer):
    room(farmer, 'New', approval_status=Approval.PENDING)
    room(farmer, 'Grow', pending_area_m2=Decimal('30'))
    room(farmer, 'Settled')
    allowance.ask(farmer, 4, 'I built a second house')
    data = auth_client(supervisor).get(COUNT).json()['data']
    assert data == {'count': 3, 'rooms': 2, 'allowance': 1, 'rounds': 0, 'nudges': 0}


def test_a_calm_cooperative_counts_zero(auth_client, supervisor):
    assert auth_client(supervisor).get(COUNT).json()['data'] == {'count': 0, 'rooms': 0, 'allowance': 0, 'rounds': 0, 'nudges': 0}


def test_other_cooperatives_are_not_counted(auth_client, supervisor, outsider, farmer):
    far = UserFactory(role='FARMER', cooperative=outsider.cooperative)
    room(far, 'Far', approval_status=Approval.PENDING)
    allowance.ask(far, 5, 'I built a second house')
    assert auth_client(supervisor).get(COUNT).json()['data']['count'] == 0
    assert auth_client(outsider).get(COUNT).json()['data']['count'] == 2


def test_the_count_drops_when_something_is_decided(auth_client, supervisor, farmer):
    pending = room(farmer, 'New', approval_status=Approval.PENDING)
    client = auth_client(supervisor)
    assert client.get(COUNT).json()['data']['count'] == 1
    client.post(f'/api/rooms/{pending.pk}/review', {'decision': 'approve'}, format='json')
    assert client.get(COUNT).json()['data']['count'] == 0


def test_an_admin_counts_everything_and_may_narrow_to_one_cooperative(auth_client, coop, farmer, outsider):
    room(farmer, 'New', approval_status=Approval.PENDING)
    far = UserFactory(role='FARMER', cooperative=outsider.cooperative)
    allowance.ask(far, 5, 'I built a second house')
    client = auth_client(UserFactory(role='ADMIN'))
    assert client.get(COUNT).json()['data'] == {'count': 2, 'rooms': 1, 'allowance': 1, 'rounds': 0, 'nudges': 0}
    assert client.get(f'{COUNT}?cooperativeId={coop.pk}').json()['data'] == {'count': 1, 'rooms': 1, 'allowance': 0, 'rounds': 0, 'nudges': 0}


def test_a_farmer_cannot_read_the_count_and_a_supervisor_with_no_cooperative_is_told_so(auth_client, farmer):
    assert auth_client(farmer).get(COUNT).status_code == 403
    assert auth_client(UserFactory(role='SUPERVISOR', cooperative=None)).get(COUNT).status_code == 403


# ── the helper the list shares ────────────────────────────────────────────────

def test_waiting_requests_are_oldest_first_and_scoped(supervisor, outsider, farmer):
    second = UserFactory(role='FARMER', cooperative=farmer.cooperative)
    first = allowance.ask(farmer, 4, 'I built a second house')
    later = allowance.ask(second, 5, 'I built a second house')
    far = UserFactory(role='FARMER', cooperative=outsider.cooperative)
    allowance.ask(far, 5, 'I built a second house')
    assert [r.pk for r in allowance.waiting_requests(supervisor)] == [first.pk, later.pk]
    assert allowance.waiting_requests(UserFactory(role='SUPERVISOR', cooperative=None)).count() == 0


# ── the evidence ──────────────────────────────────────────────────────────────

def evidence(client, farmer_id):
    return client.get(f'/api/supply/allowance/farmers/{farmer_id}')


def test_the_evidence_holds_the_card_the_farmer_and_the_rooms(auth_client, supervisor, farmer, coop):
    SupplySettings.objects.create(cooperative=coop, m2_per_box=Decimal('4'))
    allowance.set_start(farmer, coop, 2, by=supervisor)
    allowance.lower(farmer, 1, 'Outbreak last month', by=supervisor)
    approved = room(farmer, 'Approved', area_m2=Decimal('12'))
    room(farmer, 'Waiting', approval_status=Approval.PENDING, area_m2=Decimal('40'))
    room(farmer, 'Gone', is_active=False)
    allowance.ask(farmer, 3, 'I built a second house')
    data = evidence(auth_client(supervisor), farmer.pk).json()['data']
    assert data['farmer'] == {'id': farmer.pk, 'name': 'Aline Uwase', 'email': farmer.email}
    assert (data['boxes'], data['source']) == (1, 'set')
    assert [h['kind'] for h in data['history']] == ['reduction', 'start']
    assert data['openRequest']['boxesAsked'] == 3
    by_name = {r['name']: r for r in data['rooms']}
    assert set(by_name) == {'Approved', 'Waiting'}
    assert (by_name['Approved']['areaM2'], by_name['Approved']['capacityBoxes'], by_name['Approved']['id']) == (12, 3, approved.pk)
    assert by_name['Waiting']['approvalStatus'] == 'pending' and by_name['Waiting']['capacityBoxes'] is None


def test_the_capacity_is_not_known_without_the_space_per_box(auth_client, supervisor, farmer):
    room(farmer)
    data = evidence(auth_client(supervisor), farmer.pk).json()['data']
    assert data['capacityBoxes'] is None
    assert data['rooms'][0]['capacityBoxes'] is None


def test_a_room_with_a_size_change_shows_both_sizes(auth_client, supervisor, farmer):
    room(farmer, pending_area_m2=Decimal('30'))
    row = evidence(auth_client(supervisor), farmer.pk).json()['data']['rooms'][0]
    assert (row['areaM2'], row['pendingAreaM2']) == (12, 30)


def test_the_evidence_is_out_of_reach_for_others(auth_client, supervisor, outsider, farmer, coop):
    assert evidence(auth_client(outsider), farmer.pk).status_code == 404
    assert evidence(auth_client(supervisor), supervisor.pk).status_code == 404
    assert evidence(auth_client(farmer), farmer.pk).status_code == 403
    other_farmer = UserFactory(role='FARMER', cooperative=coop)
    assert evidence(auth_client(farmer), other_farmer.pk).status_code == 403
    assert evidence(auth_client(UserFactory(role='ADMIN')), farmer.pk).status_code == 200


# ── the mail links ────────────────────────────────────────────────────────────

@pytest.fixture
def sent(monkeypatch):
    mails = []
    sink = lambda subject, to, email, **kw: mails.append((subject, to, email))  # noqa: E731
    monkeypatch.setattr('farms.room_notify.send_email_async', sink)
    monkeypatch.setattr('supply.notify.send_email_async', sink)
    return mails


def test_reviewers_are_sent_to_the_decisions_page_and_farmers_to_the_app(auth_client, supervisor, farmer, sent):
    auth_client(farmer).post(f'/api/farms/{FarmFactory(owner=farmer).pk}/rooms', {'name': 'North', 'areaM2': 12}, format='json')
    auth_client(farmer).post('/api/supply/allowance/requests', {'boxesAsked': 5, 'reason': 'I built a second house'}, format='json')
    reviewer_mails = [m for m in sent if m[1] == [supervisor.email]]
    assert len(reviewer_mails) == 2
    assert all(m[2].button[1] == 'http://localhost:5173/decisions' for m in reviewer_mails)
    sent.clear()
    pending = RearingRoom.objects.get()
    auth_client(supervisor).post(f'/api/rooms/{pending.pk}/review', {'decision': 'approve'}, format='json')
    assert sent[0][1] == [farmer.email] and sent[0][2].button[1] == 'http://localhost:5173/app'
