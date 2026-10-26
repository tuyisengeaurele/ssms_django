import asyncio
import json
import time

import pytest
from asgiref.sync import sync_to_async
from django.core.cache import cache
from django.test import AsyncClient
from rest_framework_simplejwt.tokens import AccessToken

from alerts.tickets import issue_ticket
from tests.factories import AlertLogFactory, BatchFactory, CooperativeFactory, FarmFactory, UserFactory

TICKET_URL = '/api/alerts/stream-ticket'
STREAM_URL = '/api/alerts/stream'


# ── the ticket endpoint (plain sync tests) ──────────────────────────────────────────────────

@pytest.mark.django_db
def test_ticket_endpoint_needs_a_sign_in(api_client):
    assert api_client.post(TICKET_URL).status_code == 401


@pytest.mark.django_db
def test_farmers_cannot_get_a_ticket(auth_client):
    assert auth_client(UserFactory()).post(TICKET_URL).status_code == 403


@pytest.mark.django_db
@pytest.mark.parametrize('role', ['SUPERVISOR', 'ADMIN'])
def test_supervisors_and_admins_get_a_short_lived_ticket(auth_client, role):
    response = auth_client(UserFactory(role=role)).post(TICKET_URL)
    assert response.status_code == 200
    data = response.json()['data']
    assert len(data['ticket']) >= 32
    assert data['expiresIn'] == 30


@pytest.mark.django_db
def test_every_ticket_is_different(auth_client):
    client = auth_client(UserFactory(role='ADMIN'))
    tickets = {client.post(TICKET_URL).json()['data']['ticket'] for _ in range(5)}
    assert len(tickets) == 5


# ── the stream (async, so the database is shared with the event loop) ───────────────────────

transactional = pytest.mark.django_db(transaction=True)


@pytest.fixture
def fast_stream(monkeypatch):
    monkeypatch.setattr('alerts.sse_view.POLL_SECONDS', 0.05)
    monkeypatch.setattr('alerts.sse_view.MAX_STREAM_SECONDS', 0.5)


@pytest.fixture
def two_cooperatives(db):
    coop_a, coop_b = CooperativeFactory(name='Coop A'), CooperativeFactory(name='Coop B')
    farm_a = FarmFactory(owner=UserFactory(cooperative=coop_a))
    farm_b = FarmFactory(owner=UserFactory(cooperative=coop_b))
    alert_a = AlertLogFactory(batch=BatchFactory(farm=farm_a), message='Alert for A')
    alert_b = AlertLogFactory(batch=BatchFactory(farm=farm_b), message='Alert for B')
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop_a)
    return supervisor, alert_a, alert_b, farm_a


async def read_all(response):
    chunks = []
    async for chunk in response.streaming_content:
        chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)
    return ''.join(chunks)


def events(text):
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith('data: ')]


@pytest.mark.asyncio
@transactional
async def test_stream_without_a_ticket_is_401(fast_stream):
    assert (await AsyncClient().get(STREAM_URL)).status_code == 401


@pytest.mark.asyncio
@transactional
async def test_a_jwt_in_the_query_string_is_no_longer_accepted(fast_stream, two_cooperatives):
    supervisor = two_cooperatives[0]
    response = await AsyncClient().get(STREAM_URL, {'token': str(AccessToken.for_user(supervisor))})
    assert response.status_code == 401


@pytest.mark.asyncio
@transactional
async def test_a_made_up_ticket_is_401(fast_stream):
    assert (await AsyncClient().get(STREAM_URL, {'ticket': 'not-a-ticket'})).status_code == 401


@pytest.mark.asyncio
@transactional
async def test_a_ticket_works_exactly_once(fast_stream, two_cooperatives):
    ticket = await sync_to_async(issue_ticket)(two_cooperatives[0])
    first = await AsyncClient().get(STREAM_URL, {'ticket': ticket})
    assert first.status_code == 200
    await read_all(first)
    assert (await AsyncClient().get(STREAM_URL, {'ticket': ticket})).status_code == 401


@pytest.mark.asyncio
@transactional
async def test_an_expired_ticket_is_401(fast_stream, two_cooperatives):
    ticket = await sync_to_async(issue_ticket)(two_cooperatives[0])
    await sync_to_async(cache.clear)()
    assert (await AsyncClient().get(STREAM_URL, {'ticket': ticket})).status_code == 401


@pytest.mark.asyncio
@transactional
async def test_a_farmer_cannot_use_a_ticket(fast_stream, db):
    farmer = await sync_to_async(UserFactory)()
    ticket = await sync_to_async(issue_ticket)(farmer)
    assert (await AsyncClient().get(STREAM_URL, {'ticket': ticket})).status_code == 401


@pytest.mark.asyncio
@transactional
async def test_a_supervisor_only_receives_alerts_from_their_own_cooperative(fast_stream, two_cooperatives):
    supervisor = two_cooperatives[0]
    ticket = await sync_to_async(issue_ticket)(supervisor)
    response = await AsyncClient().get(STREAM_URL, {'ticket': ticket})
    assert response['Content-Type'].startswith('text/event-stream')
    assert response['Cache-Control'] == 'no-cache'
    messages = [e['message'] for e in events(await read_all(response))]
    assert messages == ['Alert for A']


@pytest.mark.asyncio
@transactional
async def test_an_admin_receives_every_alert(fast_stream, two_cooperatives):
    admin = await sync_to_async(UserFactory)(role='ADMIN')
    ticket = await sync_to_async(issue_ticket)(admin)
    response = await AsyncClient().get(STREAM_URL, {'ticket': ticket})
    assert sorted(e['message'] for e in events(await read_all(response))) == ['Alert for A', 'Alert for B']


@pytest.mark.asyncio
@transactional
async def test_an_alert_raised_after_connecting_still_arrives(monkeypatch, two_cooperatives):
    monkeypatch.setattr('alerts.sse_view.POLL_SECONDS', 0.05)
    monkeypatch.setattr('alerts.sse_view.MAX_STREAM_SECONDS', 1.0)
    supervisor, _, _, farm_a = two_cooperatives
    ticket = await sync_to_async(issue_ticket)(supervisor)

    async def raise_alert_later():
        await asyncio.sleep(0.3)
        batch = await sync_to_async(BatchFactory)(farm=farm_a)
        await sync_to_async(AlertLogFactory)(batch=batch, message='Fresh alert')

    response = await AsyncClient().get(STREAM_URL, {'ticket': ticket})
    later = asyncio.create_task(raise_alert_later())
    text = await read_all(response)
    await later
    assert 'Fresh alert' in [e['message'] for e in events(text)]


@pytest.mark.asyncio
@transactional
async def test_the_stream_stops_when_the_user_is_turned_off(monkeypatch, two_cooperatives):
    monkeypatch.setattr('alerts.sse_view.POLL_SECONDS', 0.05)
    monkeypatch.setattr('alerts.sse_view.MAX_STREAM_SECONDS', 5.0)
    supervisor = two_cooperatives[0]
    ticket = await sync_to_async(issue_ticket)(supervisor)

    async def turn_off_soon():
        await asyncio.sleep(0.2)
        supervisor.is_active = False
        await sync_to_async(supervisor.save)(update_fields=['is_active'])

    response = await AsyncClient().get(STREAM_URL, {'ticket': ticket})
    started = time.monotonic()
    task = asyncio.create_task(turn_off_soon())
    await read_all(response)
    await task
    assert time.monotonic() - started < 2.0


@pytest.mark.asyncio
@transactional
async def test_the_stream_ends_by_itself_after_the_maximum_time(monkeypatch, two_cooperatives):
    monkeypatch.setattr('alerts.sse_view.POLL_SECONDS', 0.05)
    monkeypatch.setattr('alerts.sse_view.MAX_STREAM_SECONDS', 0.3)
    ticket = await sync_to_async(issue_ticket)(two_cooperatives[0])
    started = time.monotonic()
    await read_all(await AsyncClient().get(STREAM_URL, {'ticket': ticket}))
    assert 0.25 <= time.monotonic() - started < 2.0
