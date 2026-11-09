"""Lot tracing: from a disease, a supervisor sees every farm that got the same lot of eggs, and how each batch is doing."""
from datetime import timedelta

import pytest
from django.utils import timezone

from farms.models import RearingRoom
from supply import rounds
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    CooperativeFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

LOT = 'L2611-AB12'


def url(code=LOT):
    return f'/api/supply/lots/{code}'


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')


@pytest.fixture
def outsider():
    return UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())


def farmer_batch(coop, lot=LOT, name=None, **fields):
    """A farmer of the cooperative with a farm, a room and a batch of the lot."""
    farmer = UserFactory(role='FARMER', cooperative=coop, **({'name': name} if name else {}))
    farm = FarmFactory(owner=farmer)
    room = RearingRoom.objects.create(farm=farm, name='Main house')
    return BatchFactory(farm=farm, room=room, lot_code=lot, quantity=2, **fields)


def check(batch, result, days_ago=0):
    detection = DiseaseDetectionFactory(batch=batch, result=result)
    type(detection).objects.filter(pk=detection.pk).update(detected_at=timezone.now() - timedelta(days=days_ago))
    return detection


def trace(auth_client, user, code=LOT):
    return auth_client(user).get(url(code))


def test_a_supervisor_sees_every_batch_of_the_lot_across_farmers_with_how_each_is_doing(auth_client, coop, supervisor):
    sick = farmer_batch(coop, name='Aline Uwase')
    check(sick, 'Grasserie')
    fine = farmer_batch(coop, name='Bruce Ishimwe')
    check(fine, 'Healthy')
    unseen = farmer_batch(coop, name='Gad Anaclet')

    response = trace(auth_client, supervisor)

    assert response.status_code == 200
    data = response.json()['data']
    assert data['lotCode'] == LOT
    assert [b['id'] for b in data['batches']] == [sick.pk, unseen.pk, fine.pk]
    assert [b['status'] for b in data['batches']] == ['disease', 'not_checked', 'healthy']
    assert data['summary'] == {'batches': 3, 'farms': 3, 'disease': 1, 'healthy': 1, 'notChecked': 1}
    first = data['batches'][0]
    assert first['owner']['name'] == 'Aline Uwase'
    assert first['farm']['name'] == sick.farm.name
    assert first['room']['name'] == 'Main house'
    assert first['stage'] == 'EGG'
    assert first['quantity'] == 2 and first['quantityUnit'] == 'BOXES'
    assert first['lastCheck']['result'] == 'Grasserie'


def test_the_round_the_lot_came_from_is_named(auth_client, coop, supervisor):
    rnd = rounds.create_round(
        coop, supervisor, name='November round', stock_boxes=10, request_deadline=timezone.now() + timedelta(days=3),
        delivery_date=(timezone.now() + timedelta(days=7)).date(), delivery_place='Store', expected_harvest_date=(timezone.now() + timedelta(days=40)).date(),
    )
    rounds.open_round(rnd, supervisor)
    farmer_batch(coop, lot=rnd.lot_code)

    data = trace(auth_client, supervisor, rnd.lot_code).json()['data']

    assert data['round']['id'] == rnd.pk
    assert data['round']['name'] == 'November round'
    assert data['round']['status'] == 'open'


def test_a_lot_that_no_round_made_still_traces_with_no_round(auth_client, coop, supervisor):
    farmer_batch(coop)
    assert trace(auth_client, supervisor).json()['data']['round'] is None


def test_a_lot_with_one_batch_reads_as_one(auth_client, coop, supervisor):
    farmer_batch(coop)
    data = trace(auth_client, supervisor).json()['data']
    assert data['summary'] == {'batches': 1, 'farms': 1, 'disease': 0, 'healthy': 0, 'notChecked': 1}


def test_a_batch_with_no_check_is_not_checked_never_healthy(auth_client, coop, supervisor):
    farmer_batch(coop)
    assert trace(auth_client, supervisor).json()['data']['batches'][0]['status'] == 'not_checked'


def test_the_latest_check_decides(auth_client, coop, supervisor):
    recovered = farmer_batch(coop)
    check(recovered, 'Grasserie', days_ago=5)
    check(recovered, 'Healthy', days_ago=1)
    fell_ill = farmer_batch(coop)
    check(fell_ill, 'Healthy', days_ago=5)
    check(fell_ill, 'Grasserie', days_ago=1)

    by_id = {b['id']: b['status'] for b in trace(auth_client, supervisor).json()['data']['batches']}

    assert by_id == {recovered.pk: 'healthy', fell_ill.pk: 'disease'}


def test_an_open_disease_alert_is_flagged_and_a_resolved_one_is_not(auth_client, coop, supervisor):
    open_one = farmer_batch(coop)
    AlertLogFactory(batch=open_one, type='DISEASE', message='Grasserie suspected')
    closed = farmer_batch(coop)
    AlertLogFactory(batch=closed, type='DISEASE', message='Grasserie suspected', resolved_at=timezone.now())
    other_kind = farmer_batch(coop)
    AlertLogFactory(batch=other_kind, type='TEMPERATURE')

    flags = {b['id']: b['openAlert'] for b in trace(auth_client, supervisor).json()['data']['batches']}

    assert flags == {open_one.pk: True, closed.pk: False, other_kind.pk: False}


def test_an_archived_batch_is_left_out(auth_client, coop, supervisor):
    farmer_batch(coop)
    gone = farmer_batch(coop)
    gone.is_active = False
    gone.save()

    data = trace(auth_client, supervisor).json()['data']

    assert data['summary']['batches'] == 1


def test_a_batch_of_a_farmer_outside_the_cooperative_is_never_shown(auth_client, coop, supervisor):
    farmer_batch(coop)
    farmer_batch(CooperativeFactory())

    assert trace(auth_client, supervisor).json()['data']['summary']['batches'] == 1


def test_another_cooperatives_supervisor_gets_not_found_as_for_an_unknown_lot(auth_client, coop, outsider):
    farmer_batch(coop)

    real = trace(auth_client, outsider)
    unknown = trace(auth_client, outsider, 'L0000-ZZZZ')

    assert real.status_code == unknown.status_code == 404
    assert real.json()['message'] == unknown.json()['message']


def test_a_farmer_may_not_trace_a_lot_even_their_own(auth_client, coop):
    mine = farmer_batch(coop)
    assert auth_client(mine.farm.owner).get(url()).status_code == 403


def test_an_admin_traces_any_lot(auth_client, coop):
    farmer_batch(coop)
    admin = UserFactory(role='ADMIN')
    assert trace(auth_client, admin).json()['data']['summary']['batches'] == 1


def test_a_lot_code_with_a_space_or_a_symbol_works_when_encoded(auth_client, coop, supervisor):
    farmer_batch(coop, lot='L 26-11 #1')
    response = auth_client(supervisor).get('/api/supply/lots/L%2026-11%20%231')
    assert response.status_code == 200
    assert response.json()['data']['lotCode'] == 'L 26-11 #1'


def test_a_batch_that_was_never_placed_in_a_room_has_none(auth_client, coop, supervisor):
    batch = farmer_batch(coop)
    batch.room = None
    batch.save()
    assert trace(auth_client, supervisor).json()['data']['batches'][0]['room'] is None
