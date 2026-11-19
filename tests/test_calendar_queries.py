"""The farm calendar asked for the rounds twice (deadlines, then deliveries) and for the farmer's approved requests every time.

Now it reads the rounds once, and looks up the farmer's requests only when a round delivers inside the window.
"""
from datetime import timedelta

import pytest
from django.utils import timezone

from supply.models import SupplyRound
from tests.factories import CooperativeFactory, UserFactory
from tests.query_growth import queries_for

pytestmark = pytest.mark.django_db


def a_round(coop, name, deadline_in, delivery_in):
    return SupplyRound.objects.create(
        cooperative=coop, name=name, stock_boxes=5, status='open',
        request_deadline=timezone.now() + timedelta(days=deadline_in),
        delivery_date=(timezone.now() + timedelta(days=delivery_in)).date(),
        delivery_place='Store', expected_harvest_date=(timezone.now() + timedelta(days=60)).date(),
    )


def window():
    today = timezone.now().date()
    return f'/api/calendar?from={today}&to={today + timedelta(days=30)}'


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_a_calendar_without_rounds_stays_within_seven_queries(auth_client, role):
    coop = CooperativeFactory()
    user = UserFactory(role=role, cooperative=coop)
    assert queries_for(auth_client(user), window()) <= 7


def test_it_costs_the_same_with_more_rounds(auth_client):
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    client = auth_client(farmer)
    a_round(coop, 'First', 3, 9)
    few = queries_for(client, window())
    for number in range(6):
        a_round(coop, f'Round {number}', 2 + number, 10 + number)
    assert queries_for(client, window()) == few


def test_a_round_with_its_deadline_and_delivery_in_the_window_gives_both_events(auth_client):
    coop = CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    made = a_round(coop, 'November round', 3, 9)
    events = auth_client(supervisor).get(window()).json()['data']['events']
    kinds = sorted(event['kind'] for event in events if event['detail']['roundId'] == made.pk)
    assert kinds == ['round_deadline', 'round_delivery']


def test_a_round_whose_delivery_is_after_the_window_gives_only_its_deadline(auth_client):
    coop = CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    made = a_round(coop, 'Late round', 3, 90)
    events = auth_client(supervisor).get(window()).json()['data']['events']
    assert [event['kind'] for event in events if event['detail']['roundId'] == made.pk] == ['round_deadline']


def test_a_farmer_is_shown_the_delivery_only_of_a_round_they_were_promised_eggs_in(auth_client):
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    made = a_round(coop, 'Not mine', 3, 9)
    events = auth_client(farmer).get(window()).json()['data']['events']
    assert [event['kind'] for event in events if event['detail']['roundId'] == made.pk] == ['round_deadline']
