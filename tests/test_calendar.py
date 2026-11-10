"""The farm calendar: the dated events a person may see, from facts the system holds and nothing it would have to guess."""
from datetime import date, datetime
from datetime import timezone as tz

import pytest
from django.utils import timezone

from batches.models import Batch
from farms.models import RearingRoom
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection
from supply.models import EggRequest, SupplyRound
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    CooperativeFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    HarvestRecordFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

URL = '/api/calendar'
FROM, TO = '2026-11-01', '2026-11-30'


def day(n: int, hour: int = 9) -> datetime:
    return datetime(2026, 11, n, hour, 0, tzinfo=tz.utc)


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')


def farmer_in(coop, **fields):
    return UserFactory(role='FARMER', cooperative=coop, **fields)


def batch_for(farmer, start=3, harvest=20, **fields):
    batch = BatchFactory(farm=FarmFactory(owner=farmer), expected_harvest_date=day(harvest), **fields)
    Batch.objects.filter(pk=batch.pk).update(start_date=day(start))
    return batch


def feed(auth_client, user, frm=FROM, to=TO):
    response = auth_client(user).get(URL, {'from': frm, 'to': to})
    assert response.status_code == 200, response.content
    return response.json()['data']


def kinds(data, kind=None):
    return [e for e in data['events'] if kind is None or e['kind'] == kind]


def test_a_farmer_sees_the_start_and_the_typed_harvest_date_of_their_own_batch(auth_client, coop):
    farmer = farmer_in(coop)
    batch = batch_for(farmer, start=3, harvest=20)

    data = feed(auth_client, farmer)

    started = kinds(data, 'batch_started')
    assert [(e['date'], e['batchId'], e['expected']) for e in started] == [('2026-11-03', batch.pk, False)]
    assert started[0]['farmName'] == batch.farm.name and started[0]['farmId'] == batch.farm_id
    harvest = kinds(data, 'harvest_expected')
    assert [(e['date'], e['expected']) for e in harvest] == [('2026-11-20', True)]


def test_a_batch_that_was_harvested_has_no_expected_harvest(auth_client, coop):
    farmer = farmer_in(coop)
    batch = batch_for(farmer)
    HarvestRecordFactory(batch=batch)

    assert kinds(feed(auth_client, farmer), 'harvest_expected') == []


def test_a_farmer_never_sees_another_farmers_batch(auth_client, coop):
    mine, theirs = farmer_in(coop), farmer_in(coop)
    batch_for(mine)
    other = batch_for(theirs)
    DiseaseDetectionFactory(batch=other)

    ids = {e['batchId'] for e in feed(auth_client, mine)['events'] if e['batchId']}

    assert other.pk not in ids and len(ids) == 1


def test_a_supervisor_sees_their_cooperatives_farmers_and_not_another_cooperatives(auth_client, coop, supervisor):
    inside = batch_for(farmer_in(coop))
    outside = batch_for(farmer_in(CooperativeFactory()))

    ids = {e['batchId'] for e in feed(auth_client, supervisor)['events'] if e['batchId']}

    assert inside.pk in ids and outside.pk not in ids


def test_an_admin_sees_every_cooperative(auth_client, coop):
    a = batch_for(farmer_in(coop))
    b = batch_for(farmer_in(CooperativeFactory()))
    admin = UserFactory(role='ADMIN')

    ids = {e['batchId'] for e in feed(auth_client, admin)['events'] if e['batchId']}

    assert {a.pk, b.pk} <= ids


def test_a_supervisor_with_no_cooperative_sees_nothing(auth_client, coop):
    batch_for(farmer_in(coop))
    lonely = UserFactory(role='SUPERVISOR', cooperative=None)

    assert feed(auth_client, lonely)['events'] == []


def test_an_archived_batch_is_left_out_with_its_checks_and_harvests(auth_client, coop):
    farmer = farmer_in(coop)
    gone = batch_for(farmer)
    DiseaseDetectionFactory(batch=gone)
    HarvestRecordFactory(batch=gone)
    Batch.objects.filter(pk=gone.pk).update(is_active=False)

    assert feed(auth_client, farmer)['events'] == []


def test_a_disease_check_and_a_recorded_harvest_carry_what_the_words_need(auth_client, coop):
    farmer = farmer_in(coop)
    batch = batch_for(farmer)
    check = DiseaseDetectionFactory(batch=batch, result='Grasserie')
    DiseaseDetection.objects.filter(pk=check.pk).update(detected_at=day(10))
    record = HarvestRecordFactory(batch=batch)
    HarvestRecord.objects.filter(pk=record.pk).update(harvested_at=day(21))

    data = feed(auth_client, farmer)

    assert [(e['date'], e['detail']['result']) for e in kinds(data, 'disease_check')] == [('2026-11-10', 'Grasserie')]
    assert [(e['date'], e['expected']) for e in kinds(data, 'harvest_recorded')] == [('2026-11-21', False)]


def test_a_stage_change_names_the_stage_when_the_alert_says_it(auth_client, coop):
    farmer = farmer_in(coop)
    batch = batch_for(farmer)
    named = AlertLogFactory(batch=batch, type='STAGE_CHANGE', message='Batch stage updated to LARVA.')
    unnamed = AlertLogFactory(batch=batch, type='STAGE_CHANGE', message='Something else happened.')
    from alerts.models import AlertLog
    AlertLog.objects.filter(pk=named.pk).update(created_at=day(8))
    AlertLog.objects.filter(pk=unnamed.pk).update(created_at=day(9))

    changes = {e['date']: e['detail'].get('stage') for e in kinds(feed(auth_client, farmer), 'stage_changed')}

    assert changes == {'2026-11-08': 'LARVA', '2026-11-09': None}


def test_other_alerts_are_not_events(auth_client, coop):
    farmer = farmer_in(coop)
    AlertLogFactory(batch=batch_for(farmer), type='TEMPERATURE')

    assert kinds(feed(auth_client, farmer), 'stage_changed') == []


def test_the_window_includes_both_end_days_and_nothing_outside(auth_client, coop):
    farmer = farmer_in(coop)
    for start in (1, 15, 30):
        batch_for(farmer, start=start, harvest=28)
    batch_for(farmer, start=2)
    Batch.objects.filter(farm__owner=farmer, start_date__date=date(2026, 11, 2)).update(start_date=datetime(2026, 10, 31, 23, 59, tzinfo=tz.utc))

    dates = sorted(e['date'] for e in kinds(feed(auth_client, farmer, '2026-11-01', '2026-11-30'), 'batch_started'))
    assert dates == ['2026-11-01', '2026-11-15', '2026-11-30']
    one_day = feed(auth_client, farmer, '2026-11-15', '2026-11-15')
    assert [e['date'] for e in kinds(one_day, 'batch_started')] == ['2026-11-15']


def test_naive_dates_from_an_older_database_still_work(auth_client, coop, naive_batch_dates):
    farmer = farmer_in(coop)
    batch_for(farmer, start=3, harvest=20)

    data = feed(auth_client, farmer)

    assert [e['date'] for e in kinds(data, 'batch_started')] == ['2026-11-03']
    assert [e['date'] for e in kinds(data, 'harvest_expected')] == ['2026-11-20']


def test_events_come_in_date_order_with_a_stable_id(auth_client, coop):
    farmer = farmer_in(coop)
    batch_for(farmer, start=12, harvest=5)
    batch_for(farmer, start=2, harvest=25)

    events = feed(auth_client, farmer)['events']

    assert [e['date'] for e in events] == sorted(e['date'] for e in events)
    assert len({e['id'] for e in events}) == len(events)


def test_the_answer_names_the_window(auth_client, coop):
    data = feed(auth_client, farmer_in(coop))
    assert (data['from'], data['to'], data['truncated']) == (FROM, TO, False)


def test_no_window_means_the_current_month(auth_client, coop):
    farmer = farmer_in(coop)
    response = auth_client(farmer).get(URL)
    assert response.status_code == 200
    today = timezone.now().date()
    data = response.json()['data']
    assert data['from'] == today.replace(day=1).isoformat()
    assert date.fromisoformat(data['to']) >= today


@pytest.mark.parametrize('params', [
    {'from': '2026-11-30', 'to': '2026-11-01'},
    {'from': '2026-01-01', 'to': '2026-12-31'},
    {'from': 'tomorrow', 'to': '2026-11-30'},
    {'from': '2026-11-01'},
])
def test_a_bad_window_is_refused_with_a_reason(auth_client, coop, params):
    response = auth_client(farmer_in(coop)).get(URL, params)
    assert response.status_code == 422
    assert response.json()['message']


def test_a_farmer_sees_the_deadline_of_an_open_round_of_their_cooperative_and_no_draft_or_cancelled_one(auth_client, coop):
    farmer = farmer_in(coop)
    base = dict(cooperative=coop, stock_boxes=10, delivery_place='Store', expected_harvest_date=date(2026, 12, 20))
    SupplyRound.objects.create(name='Open one', request_deadline=day(12), delivery_date=date(2026, 11, 18), status='open', **base)
    SupplyRound.objects.create(name='Draft one', request_deadline=day(13), delivery_date=date(2026, 11, 19), status='draft', **base)
    SupplyRound.objects.create(name='Cancelled one', request_deadline=day(14), delivery_date=date(2026, 11, 20), status='cancelled', **base)
    SupplyRound.objects.create(name='Elsewhere', cooperative=CooperativeFactory(), stock_boxes=5, request_deadline=day(15), delivery_date=date(2026, 11, 21), delivery_place='x', expected_harvest_date=date(2026, 12, 20), status='open')

    deadlines = kinds(feed(auth_client, farmer), 'round_deadline')

    assert [(e['date'], e['detail']['name']) for e in deadlines] == [('2026-11-12', 'Open one')]
    assert kinds(feed(auth_client, farmer), 'round_delivery') == []


def test_a_farmer_sees_a_delivery_only_for_a_round_they_have_an_approved_request_in(auth_client, coop):
    farmer, other = farmer_in(coop), farmer_in(coop)
    base = dict(cooperative=coop, stock_boxes=10, delivery_place='Cooperative store', expected_harvest_date=date(2026, 12, 20), request_deadline=day(5))
    mine = SupplyRound.objects.create(name='Mine', delivery_date=date(2026, 11, 18), status='allocated', **base)
    SupplyRound.objects.create(name='Not mine', delivery_date=date(2026, 11, 19), status='allocated', **base)
    farm = FarmFactory(owner=farmer)
    room = RearingRoom.objects.create(farm=farm, name='Main house')
    EggRequest.objects.create(round=mine, farmer=farmer, farm=farm, room=room, boxes_asked=2, boxes_approved=2, status='approved')
    for status in ('declined', 'waitlisted'):
        EggRequest.objects.create(round=SupplyRound.objects.create(name=f'{status} round', delivery_date=date(2026, 11, 25), status='closed', **base),
                                  farmer=farmer, farm=farm, room=room, boxes_asked=2, status=status)

    deliveries = kinds(feed(auth_client, farmer), 'round_delivery')

    assert [(e['date'], e['detail']['name'], e['detail']['place']) for e in deliveries] == [('2026-11-18', 'Mine', 'Cooperative store')]
    assert kinds(feed(auth_client, other), 'round_delivery') == []


def test_a_supervisor_sees_the_deadline_and_delivery_of_the_cooperatives_live_rounds(auth_client, coop, supervisor):
    base = dict(cooperative=coop, stock_boxes=10, delivery_place='Store', expected_harvest_date=date(2026, 12, 20))
    SupplyRound.objects.create(name='Live', request_deadline=day(12), delivery_date=date(2026, 11, 18), status='open', **base)
    SupplyRound.objects.create(name='Draft', request_deadline=day(13), delivery_date=date(2026, 11, 19), status='draft', **base)

    data = feed(auth_client, supervisor)

    assert [e['detail']['name'] for e in kinds(data, 'round_deadline')] == ['Live']
    assert [e['detail']['name'] for e in kinds(data, 'round_delivery')] == ['Live']


def test_more_than_five_hundred_events_are_cut_and_the_answer_says_so(auth_client, coop):
    farmer = farmer_in(coop)
    farm = FarmFactory(owner=farmer)
    batch = BatchFactory(farm=farm, expected_harvest_date=day(28))
    DiseaseDetection.objects.bulk_create(
        [DiseaseDetection(batch=batch, image_url='https://example.invalid/x.jpg', result='Healthy', confidence=0.9) for _ in range(520)])
    DiseaseDetection.objects.filter(batch=batch).update(detected_at=day(10))

    data = feed(auth_client, farmer)

    assert len(data['events']) == 500 and data['truncated'] is True


def test_the_number_of_queries_does_not_grow_with_the_number_of_batches(auth_client, coop, django_assert_max_num_queries):
    farmer = farmer_in(coop)
    batch_for(farmer)
    client = auth_client(farmer)
    client.get(URL, {'from': FROM, 'to': TO})
    for _ in range(25):
        batch = batch_for(farmer)
        DiseaseDetectionFactory(batch=batch)

    with django_assert_max_num_queries(14):
        assert client.get(URL, {'from': FROM, 'to': TO}).status_code == 200


def test_a_stranger_is_asked_to_sign_in(api_client):
    assert api_client.get(URL, {'from': FROM, 'to': TO}).status_code == 401
