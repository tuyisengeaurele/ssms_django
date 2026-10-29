"""When someone creates an account and ticks the box for the terms, the time is kept with the account."""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

pytestmark = pytest.mark.django_db

URL = '/api/auth/register'
User = get_user_model()


def register(api_client, **extra):
    body = {'name': 'Aline Uwase', 'email': 'aline@example.com', 'password': 'Silk2026!x', **extra}
    return api_client.post(URL, body, format='json')


def test_ticking_the_box_keeps_the_time(api_client):
    before = timezone.now()
    assert register(api_client, acceptedTerms=True).status_code == 201
    accepted = User.objects.get(email='aline@example.com').terms_accepted_at
    assert accepted is not None
    assert before - timedelta(seconds=1) <= accepted <= timezone.now() + timedelta(seconds=1)


def test_not_sending_it_keeps_nothing(api_client):
    assert register(api_client).status_code == 201
    assert User.objects.get(email='aline@example.com').terms_accepted_at is None


def test_saying_no_keeps_nothing(api_client):
    assert register(api_client, acceptedTerms=False).status_code == 201
    assert User.objects.get(email='aline@example.com').terms_accepted_at is None


def test_the_answer_does_not_hand_the_time_back(api_client):
    body = register(api_client, acceptedTerms=True).json()
    assert 'termsAcceptedAt' not in body['data']['user']


def test_a_user_made_any_other_way_has_none():
    user = User.objects.create_user(email='x@example.com', password='Silk2026!x', name='X')
    assert user.terms_accepted_at is None
