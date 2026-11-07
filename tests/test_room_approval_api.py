"""Room approval through the API: a farmer's room waits, a reviewer decides, and the list of what waits is scoped.

The rules themselves are in test_room_review.py. These tests are about who may ask, what comes back, and what is written down.
"""
from decimal import Decimal

import pytest

from audit_log.models import AuditLog
from farms.models import RearingRoom
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

Approval = RearingRoom.Approval


@pytest.fixture
def world():
    coop = CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    farmer = UserFactory(role='FARMER', cooperative=coop)
    return coop, supervisor, farmer, FarmFactory(owner=farmer)


def add(client, farm, name='Room A', **body):
    return client.post(f'/api/farms/{farm.pk}/rooms', {'name': name, 'areaM2': 12, **body}, format='json')


def room_of(farm, name='Room A', **fields):
    return RearingRoom.objects.create(farm=farm, name=name, **fields)


def review(client, room, decision, note=''):
    return client.post(f'/api/rooms/{room.pk}/review', {'decision': decision, 'note': note}, format='json')


# ── a farmer adds a room ──────────────────────────────────────────────────────

def test_a_new_room_needs_a_size(auth_client, world):
    _, _, farmer, farm = world
    response = auth_client(farmer).post(f'/api/farms/{farm.pk}/rooms', {'name': 'Room A'}, format='json')
    assert response.status_code == 422
    assert 'areaM2' in response.json()['errors']
    assert RearingRoom.objects.count() == 0


@pytest.mark.parametrize('size', [0, 0.5, 5001, 'big', -3])
def test_a_size_outside_one_to_five_thousand_is_refused(auth_client, world, size):
    _, _, farmer, farm = world
    assert add(auth_client(farmer), farm, areaM2=size).status_code == 422
    assert RearingRoom.objects.count() == 0


def test_a_farmers_room_waits_for_a_reviewer(auth_client, world):
    _, _, farmer, farm = world
    response = add(auth_client(farmer), farm, areaM2=12.5)
    assert response.status_code == 201
    row = response.json()['data']
    assert row['approvalStatus'] == 'pending' and row['areaM2'] == 12.5 and row['pendingAreaM2'] is None
    assert row['reviewNote'] == '' and row['reviewedAt'] is None
    assert RearingRoom.objects.get().approval_status == Approval.PENDING


def test_a_room_added_by_an_admin_is_approved_at_once(auth_client, world):
    _, _, _, farm = world
    admin = UserFactory(role='ADMIN')
    row = add(auth_client(admin), farm).json()['data']
    assert row['approvalStatus'] == 'approved' and row['reviewedAt'] is not None


def test_the_room_list_carries_the_approval_fields(auth_client, world):
    _, _, farmer, farm = world
    room_of(farm, 'Old', area_m2=Decimal('10'))
    room_of(farm, 'New', approval_status=Approval.PENDING, area_m2=Decimal('8'))
    rows = {r['name']: r for r in auth_client(farmer).get(f'/api/farms/{farm.pk}/rooms').json()['data']}
    assert rows['Old']['approvalStatus'] == 'approved' and rows['New']['approvalStatus'] == 'pending'


# ── a farmer changes a room ───────────────────────────────────────────────────

def test_a_new_size_for_an_approved_room_is_queued(auth_client, world):
    _, _, farmer, farm = world
    room = room_of(farm, area_m2=Decimal('10'))
    row = auth_client(farmer).patch(f'/api/rooms/{room.pk}', {'areaM2': 20}, format='json').json()['data']
    assert (row['areaM2'], row['pendingAreaM2'], row['approvalStatus']) == (10.0, 20.0, 'approved')
    assert AuditLog.objects.filter(resource='Room', detail__contains='size').exists()


def test_renaming_a_room_or_changing_its_notes_never_changes_its_state(auth_client, world):
    _, _, farmer, farm = world
    room = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('10'))
    row = auth_client(farmer).patch(f'/api/rooms/{room.pk}', {'name': 'Renamed', 'notes': 'North'}, format='json').json()['data']
    assert (row['name'], row['approvalStatus'], row['areaM2']) == ('Renamed', 'pending', 10.0)


def test_a_rejected_room_comes_back_when_the_farmer_gives_a_new_size(auth_client, world):
    _, _, farmer, farm = world
    room = room_of(farm, approval_status=Approval.REJECTED, area_m2=Decimal('2'), review_note='Too small')
    row = auth_client(farmer).patch(f'/api/rooms/{room.pk}', {'areaM2': 9}, format='json').json()['data']
    assert (row['approvalStatus'], row['areaM2'], row['reviewNote']) == ('pending', 9.0, 'Too small')


def test_a_bad_size_on_a_change_is_refused(auth_client, world):
    _, _, farmer, farm = world
    room = room_of(farm, area_m2=Decimal('10'))
    assert auth_client(farmer).patch(f'/api/rooms/{room.pk}', {'areaM2': 99999}, format='json').status_code == 422


# ── a reviewer decides ────────────────────────────────────────────────────────

def test_a_supervisor_of_the_cooperative_approves_a_room(auth_client, world):
    _, supervisor, _, farm = world
    room = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('12'))
    response = review(auth_client(supervisor), room, 'approve')
    assert response.status_code == 200
    assert response.json()['data']['approvalStatus'] == 'approved'
    room.refresh_from_db()
    assert room.reviewed_by_id == supervisor.pk
    entry = AuditLog.objects.filter(resource='Room', resource_id=room.pk, detail__contains='Approved').get()
    assert entry.user_id == supervisor.pk


def test_a_supervisor_rejects_a_room_with_a_note(auth_client, world):
    _, supervisor, _, farm = world
    room = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('2'))
    response = review(auth_client(supervisor), room, 'reject', 'Too small for a batch')
    assert response.status_code == 200
    row = response.json()['data']
    assert (row['approvalStatus'], row['reviewNote']) == ('rejected', 'Too small for a batch')


def test_a_rejection_without_a_note_is_refused_and_changes_nothing(auth_client, world):
    _, supervisor, _, farm = world
    room = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('2'))
    response = review(auth_client(supervisor), room, 'reject', '  ')
    assert response.status_code == 422 and response.json()['code'] == 'note_required'
    room.refresh_from_db()
    assert room.approval_status == Approval.PENDING


def test_approving_a_queued_size_makes_it_the_size(auth_client, world):
    _, supervisor, _, farm = world
    room = room_of(farm, area_m2=Decimal('10'), pending_area_m2=Decimal('20'))
    row = review(auth_client(supervisor), room, 'approve').json()['data']
    assert (row['areaM2'], row['pendingAreaM2']) == (20.0, None)


def test_an_admin_may_review_any_room(auth_client, world):
    _, _, _, farm = world
    room = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('12'))
    assert review(auth_client(UserFactory(role='ADMIN')), room, 'approve').status_code == 200


def test_a_supervisor_of_another_cooperative_gets_not_found(auth_client, world):
    _, _, _, farm = world
    stranger = UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())
    room = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('12'))
    assert review(auth_client(stranger), room, 'approve').status_code == 404
    room.refresh_from_db()
    assert room.approval_status == Approval.PENDING


def test_a_farmer_cannot_approve_even_their_own_room(auth_client, world):
    _, _, farmer, farm = world
    room = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('12'))
    assert review(auth_client(farmer), room, 'approve').status_code == 403
    room.refresh_from_db()
    assert room.approval_status == Approval.PENDING


def test_a_second_decision_is_a_conflict(auth_client, world):
    _, supervisor, _, farm = world
    room = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('12'))
    assert review(auth_client(supervisor), room, 'approve').status_code == 200
    again = review(auth_client(supervisor), room, 'reject', 'Changed my mind')
    assert again.status_code == 409 and again.json()['code'] == 'nothing_to_review'


def test_a_missing_or_unknown_decision_is_refused(auth_client, world):
    _, supervisor, _, farm = world
    room = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('12'))
    assert review(auth_client(supervisor), room, 'maybe').status_code == 400
    assert auth_client(supervisor).post(f'/api/rooms/{room.pk}/review', {}, format='json').status_code == 400


# ── the list of what waits ────────────────────────────────────────────────────

def test_a_supervisor_sees_what_waits_in_their_cooperative(auth_client, world):
    _, supervisor, farmer, farm = world
    new = room_of(farm, 'New', approval_status=Approval.PENDING, area_m2=Decimal('8'))
    resized = room_of(farm, 'Resized', area_m2=Decimal('10'), pending_area_m2=Decimal('20'))
    room_of(farm, 'Fine', area_m2=Decimal('10'))
    data = auth_client(supervisor).get('/api/team/rooms?status=pending').json()['data']
    assert data['count'] == 2
    rows = {r['id']: r for r in data['rooms']}
    assert rows[new.pk]['kind'] == 'new' and rows[resized.pk]['kind'] == 'size'
    assert rows[resized.pk]['pendingAreaM2'] == 20.0 and rows[resized.pk]['areaM2'] == 10.0
    assert rows[new.pk]['farm'] == {'id': farm.pk, 'name': farm.name}
    assert rows[new.pk]['owner'] == {'name': farmer.name, 'email': farmer.email}


def test_a_supervisor_of_another_cooperative_sees_none_of_it(auth_client, world):
    _, _, _, farm = world
    room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('8'))
    stranger = UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())
    assert auth_client(stranger).get('/api/team/rooms').json()['data'] == {'rooms': [], 'count': 0}


def test_an_admin_sees_every_waiting_room_and_can_narrow_to_a_cooperative(auth_client, world):
    coop, _, _, farm = world
    mine = room_of(farm, approval_status=Approval.PENDING, area_m2=Decimal('8'))
    other = room_of(
        FarmFactory(owner=UserFactory(role='FARMER', cooperative=CooperativeFactory())), approval_status=Approval.PENDING,
        area_m2=Decimal('8'),
    )
    admin = auth_client(UserFactory(role='ADMIN'))
    assert {r['id'] for r in admin.get('/api/team/rooms').json()['data']['rooms']} == {mine.pk, other.pk}
    narrowed = admin.get(f'/api/team/rooms?cooperativeId={coop.pk}').json()['data']['rooms']
    assert [r['id'] for r in narrowed] == [mine.pk]


def test_a_farmer_cannot_read_the_list(auth_client, world):
    _, _, farmer, _ = world
    assert auth_client(farmer).get('/api/team/rooms').status_code == 403


def test_a_supervisor_with_no_cooperative_is_told_so(auth_client):
    lonely = UserFactory(role='SUPERVISOR', cooperative=None)
    assert auth_client(lonely).get('/api/team/rooms').status_code == 403


def test_the_list_costs_the_same_number_of_queries_however_many_rooms_wait(auth_client, world):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    _, supervisor, _, farm = world
    client = auth_client(supervisor)
    room_of(farm, 'One', approval_status=Approval.PENDING, area_m2=Decimal('8'))
    client.get('/api/team/rooms')
    with CaptureQueriesContext(connection) as few:
        client.get('/api/team/rooms')
    for n in range(5):
        room_of(FarmFactory(owner=farm.owner), f'More {n}', approval_status=Approval.PENDING, area_m2=Decimal('8'))
    with CaptureQueriesContext(connection) as many:
        client.get('/api/team/rooms')
    assert len(many) == len(few)
