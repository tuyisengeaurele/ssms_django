"""The getting started card is on a farmer's dashboard until they are past every step, so it is read on most page loads.

It asked for the farmer's rooms up to three times and their egg requests up to four, each a round trip to a database in another
country. It now reads each once, however many rooms and requests there are.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from farms.models import RearingRoom
from supply.models import EggRequest, SupplyRound
from tests.factories import CooperativeFactory, FarmFactory, UserFactory
from tests.query_growth import queries_for

pytestmark = pytest.mark.django_db

URL = '/api/supply/onboarding'


@pytest.fixture
def farmer():
    return UserFactory(role='FARMER', cooperative=CooperativeFactory())


def a_round(farmer, name, status='done'):
    return SupplyRound.objects.create(
        cooperative=farmer.cooperative, name=name, stock_boxes=5, status=status,
        request_deadline=timezone.now() - timedelta(days=20), delivery_date=(timezone.now() - timedelta(days=10)).date(),
        delivery_place='Store', expected_harvest_date=(timezone.now() + timedelta(days=30)).date(),
    )


def test_a_farmer_with_nothing_yet_stays_within_the_budget(auth_client, farmer):
    assert queries_for(auth_client(farmer), URL) <= 6


def test_it_costs_the_same_with_more_rooms_and_requests(auth_client, farmer):
    client = auth_client(farmer)
    farm = FarmFactory(owner=farmer)
    first = RearingRoom.objects.create(farm=farm, name='First', area_m2=Decimal('20'), approval_status='pending')
    few = queries_for(client, URL)
    for number, status in enumerate(['rejected', 'pending', 'rejected', 'pending']):
        RearingRoom.objects.create(farm=farm, name=f'Room {number}', area_m2=Decimal('20'), approval_status=status)
    for number in range(5):
        EggRequest.objects.create(round=a_round(farmer, f'Round {number}'), farmer=farmer, farm=farm, room=first, boxes_asked=1, status='declined')
    assert queries_for(client, URL) == few


def test_the_answer_is_what_it_was(auth_client, farmer):
    farm = FarmFactory(owner=farmer)
    room = RearingRoom.objects.create(farm=farm, name='Approved', area_m2=Decimal('20'))
    EggRequest.objects.create(round=a_round(farmer, 'Old round'), farmer=farmer, farm=farm, room=room, boxes_asked=1, status='declined', decision_note='No stock')
    data = auth_client(farmer).get(URL).json()['data']
    steps = {step['key']: step for step in data['steps']}
    assert steps['room']['state'] == 'done'
    assert steps['eggs']['state'] == 'not_given'
    assert steps['eggs']['detail']['roundName'] == 'Old round'
    assert steps['eggs']['detail']['note'] == 'No stock'
    assert data['complete'] is False
