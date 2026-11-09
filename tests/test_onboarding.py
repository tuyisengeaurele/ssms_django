"""The getting started checklist: where a new farmer is, and who they are waiting for."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from farms.models import RearingRoom
from supply import allowance, rounds
from supply.models import EggRequest, SupplyRound, SupplySettings
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = '/api/supply/onboarding'


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')


@pytest.fixture
def farmer(coop):
    return UserFactory(role='FARMER', cooperative=coop, name='Aline Uwase')


def read(auth_client, user):
    data = auth_client(user).get(URL).json()['data']
    return data, {s['key']: s for s in data['steps']}


def make_room(farmer, **fields):
    farm = FarmFactory(owner=farmer) if not farmer.farms.filter(is_active=True).exists() else farmer.farms.filter(is_active=True).first()
    fields.setdefault('area_m2', Decimal('20'))
    fields.setdefault('name', f'Room {RearingRoom.objects.count() + 1}')
    return RearingRoom.objects.create(farm=farm, **fields)


def make_round(coop, supervisor, status='open', **over):
    fields = {
        'name': 'November round', 'stock_boxes': 10, 'request_deadline': timezone.now() + timedelta(days=3),
        'delivery_date': (timezone.now() + timedelta(days=7)).date(), 'delivery_place': 'Cooperative store',
        'expected_harvest_date': (timezone.now() + timedelta(days=40)).date(), **over,
    }
    rnd = rounds.create_round(coop, supervisor, **fields)
    rounds.open_round(rnd, supervisor)
    if status != 'open':
        SupplyRound.objects.filter(pk=rnd.pk).update(status=status)
        rnd.refresh_from_db()
    return rnd


# ── the steps in order ────────────────────────────────────────────────────────

def test_a_brand_new_farmer_in_a_cooperative_has_one_step_done(auth_client, farmer):
    data, steps = read(auth_client, farmer)
    assert [s['key'] for s in data['steps']] == ['cooperative', 'farm', 'room', 'eggs']
    assert (steps['cooperative']['state'], steps['farm']['state'], steps['room']['state'], steps['eggs']['state']) == ('done', 'todo', 'todo', 'no_round')
    assert data['complete'] is False


def test_a_farmer_in_no_cooperative_is_told_to_join_one(auth_client):
    loner = UserFactory(role='FARMER', cooperative=None)
    data, steps = read(auth_client, loner)
    assert (steps['cooperative']['state'], steps['eggs']['state']) == ('todo', 'no_round')
    assert data['complete'] is False


def test_a_farm_makes_that_step_done_and_names_the_farm(auth_client, farmer):
    farm = FarmFactory(owner=farmer)
    _, steps = read(auth_client, farmer)
    assert (steps['farm']['state'], steps['farm']['detail']['farmId']) == ('done', farm.pk)


def test_a_deleted_farm_does_not_count(auth_client, farmer):
    FarmFactory(owner=farmer, is_active=False)
    assert read(auth_client, farmer)[1]['farm']['state'] == 'todo'


def test_a_room_waiting_names_who_decides(auth_client, farmer, supervisor):
    UserFactory(role='SUPERVISOR', cooperative=farmer.cooperative, name='Bruce Ishimwe')
    make_room(farmer, approval_status='pending')
    step = read(auth_client, farmer)[1]['room']
    assert step['state'] == 'waiting'
    assert sorted(step['detail']['waitingFor']) == ['Bruce Ishimwe', 'Claire Uwimana']


def test_with_no_supervisor_the_admins_are_named(auth_client):
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    admin = UserFactory(role='ADMIN', name='Admin One')
    make_room(farmer, approval_status='pending')
    assert read(auth_client, farmer)[1]['room']['detail']['waitingFor'] == [admin.name]


def test_a_room_turned_down_says_so_with_the_reason(auth_client, farmer):
    make_room(farmer, approval_status='rejected', review_note='Too small for a batch')
    step = read(auth_client, farmer)[1]['room']
    assert (step['state'], step['detail']['note']) == ('rejected', 'Too small for a batch')


def test_one_approved_room_makes_the_step_done_whatever_the_others_are(auth_client, farmer):
    make_room(farmer, approval_status='rejected')
    make_room(farmer, approval_status='approved')
    assert read(auth_client, farmer)[1]['room']['state'] == 'done'


def test_a_deleted_room_does_not_count(auth_client, farmer):
    make_room(farmer, is_active=False)
    assert read(auth_client, farmer)[1]['room']['state'] == 'todo'


# ── the eggs step ─────────────────────────────────────────────────────────────

def test_an_open_round_is_ready_for_a_farmer_with_an_approved_room(auth_client, farmer, supervisor, coop):
    make_room(farmer)
    rnd = make_round(coop, supervisor)
    step = read(auth_client, farmer)[1]['eggs']
    assert (step['state'], step['detail']['roundName']) == ('ready', rnd.name)


def test_an_open_round_needs_a_room_when_none_is_approved(auth_client, farmer, supervisor, coop):
    make_room(farmer, approval_status='pending')
    make_round(coop, supervisor)
    assert read(auth_client, farmer)[1]['eggs']['state'] == 'needs_room'


def test_a_round_past_its_deadline_or_not_yet_open_is_no_round(auth_client, farmer, supervisor, coop):
    make_room(farmer)
    late = make_round(coop, supervisor)
    SupplyRound.objects.filter(pk=late.pk).update(request_deadline=timezone.now() - timedelta(minutes=1))
    assert read(auth_client, farmer)[1]['eggs']['state'] == 'no_round'
    rounds.create_round(coop, supervisor, name='Draft', stock_boxes=3, request_deadline=timezone.now() + timedelta(days=3),
                        delivery_date=(timezone.now() + timedelta(days=7)).date(), delivery_place='Store', expected_harvest_date=(timezone.now() + timedelta(days=40)).date())
    assert read(auth_client, farmer)[1]['eggs']['state'] == 'no_round'


def test_another_cooperatives_round_is_not_shown(auth_client, farmer):
    make_room(farmer)
    other = CooperativeFactory()
    make_round(other, UserFactory(role='SUPERVISOR', cooperative=other))
    assert read(auth_client, farmer)[1]['eggs']['state'] == 'no_round'


def asked(farmer, coop, supervisor, boxes=2):
    allowance.set_start(farmer, coop, 3, by=None)
    settings = SupplySettings.for_cooperative(coop)
    settings.m2_per_box = Decimal('4')
    settings.save()
    room = make_room(farmer)
    rnd = make_round(coop, supervisor)
    return rnd, room, rounds.submit_request(farmer, rnd, room, boxes)


def test_a_waiting_request_says_who_decides(auth_client, farmer, supervisor, coop):
    asked(farmer, coop, supervisor)
    assert read(auth_client, farmer)[1]['eggs']['state'] == 'waiting'


def test_an_approved_request_gives_the_delivery(auth_client, farmer, supervisor, coop):
    rnd, room, request = asked(farmer, coop, supervisor)
    rounds.close_round(rnd)
    rounds.confirm(rnd, supervisor, [{'id': request.pk, 'boxes': 2}])
    step = read(auth_client, farmer)[1]['eggs']
    assert (step['state'], step['detail']['boxes'], step['detail']['deliveryPlace'], step['detail']['deliveryDate']) == ('approved', 2, 'Cooperative store', rnd.delivery_date.isoformat())


@pytest.mark.parametrize('boxes,note,expected', [(0, '', 'not_given'), (0, 'No space in your room', 'not_given')])
def test_a_waitlisted_or_declined_request_says_so_with_the_reason(auth_client, farmer, supervisor, coop, boxes, note, expected):
    rnd, room, request = asked(farmer, coop, supervisor)
    rounds.close_round(rnd)
    rounds.confirm(rnd, supervisor, [{'id': request.pk, 'boxes': boxes, 'decline_note': note}])
    step = read(auth_client, farmer)[1]['eggs']
    assert (step['state'], step['detail']['note']) == (expected, note)


def test_a_cancelled_request_is_forgotten(auth_client, farmer, supervisor, coop):
    rnd, room, request = asked(farmer, coop, supervisor)
    rounds.cancel_request(request, farmer)
    assert read(auth_client, farmer)[1]['eggs']['state'] == 'ready'


def test_received_eggs_make_the_step_and_the_whole_list_done(auth_client, farmer, supervisor, coop):
    rnd, room, request = asked(farmer, coop, supervisor)
    rounds.close_round(rnd)
    rounds.confirm(rnd, supervisor, [{'id': request.pk, 'boxes': 2}])
    rounds.receive(EggRequest.objects.get(pk=request.pk), farmer, 2, 'good')
    data, steps = read(auth_client, farmer)
    assert (steps['eggs']['state'], data['complete']) == ('done', True)


def test_a_farmer_with_a_batch_made_by_hand_is_complete_already(auth_client, farmer):
    BatchFactory(farm=FarmFactory(owner=farmer))
    assert read(auth_client, farmer)[0]['complete'] is True


def test_a_deleted_batch_does_not_complete_the_list(auth_client, farmer):
    BatchFactory(farm=FarmFactory(owner=farmer), is_active=False)
    assert read(auth_client, farmer)[0]['complete'] is False


# ── who may ask ───────────────────────────────────────────────────────────────

def test_one_farmer_never_sees_another_farmers_progress(auth_client, farmer, coop):
    other = UserFactory(role='FARMER', cooperative=coop)
    make_room(other, approval_status='pending')
    assert read(auth_client, farmer)[1]['room']['state'] == 'todo'


def test_staff_cannot_read_a_checklist(auth_client, supervisor):
    assert auth_client(supervisor).get(URL).status_code == 403
    assert auth_client(UserFactory(role='ADMIN')).get(URL).status_code == 403
