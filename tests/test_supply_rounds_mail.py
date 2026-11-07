"""Who is told about a supply round: every farmer when it opens, each requester when the split is confirmed or the round is
cancelled, and the farmer when a supervisor records the receipt for them. One mail each, and a mail that fails never fails the request."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from farms.models import RearingRoom
from supply import allowance
from supply.models import SupplySettings
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

ROUNDS = '/api/supply/rounds'


@pytest.fixture
def sent(monkeypatch):
    mails = []
    monkeypatch.setattr('supply.round_notify.send_email_async', lambda subject, to, email, **kw: mails.append((subject, to, email)))
    return mails


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')


def farmer_with_room(coop, boxes=3):
    settings = SupplySettings.for_cooperative(coop)
    settings.m2_per_box = Decimal('4')
    settings.save()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    allowance.set_start(farmer, coop, boxes, by=None)
    return farmer, RearingRoom.objects.create(farm=FarmFactory(owner=farmer), name='Room A', area_m2=Decimal('20'))


def body(**over):
    base = {
        'name': 'November round', 'stockBoxes': 10, 'requestDeadline': (timezone.now() + timedelta(days=3)).isoformat(),
        'deliveryDate': (timezone.now() + timedelta(days=7)).date().isoformat(), 'deliveryPlace': 'Cooperative store',
        'expectedHarvestDate': (timezone.now() + timedelta(days=40)).date().isoformat(),
    }
    return {**base, **over}


def open_round(client, **over):
    round_id = client.post(ROUNDS, body(**over), format='json').json()['data']['id']
    client.post(f'{ROUNDS}/{round_id}/action', {'action': 'open'}, format='json')
    return round_id


def recipients(sent):
    return sorted(address for _, to, _ in sent for address in to)


# ── a round opens ─────────────────────────────────────────────────────────────

def test_opening_tells_each_active_farmer_of_the_cooperative_in_a_mail_of_their_own(auth_client, supervisor, coop, sent):
    a, _ = farmer_with_room(coop)
    b, _ = farmer_with_room(coop)
    UserFactory(role='FARMER', cooperative=coop, is_active=False)
    UserFactory(role='FARMER', cooperative=CooperativeFactory())
    open_round(auth_client(supervisor))
    assert recipients(sent) == sorted([a.email, b.email])
    assert all(len(to) == 1 for _, to, _ in sent)


def test_the_opening_mail_says_what_when_and_where_and_has_one_button(auth_client, supervisor, coop, sent):
    farmer_with_room(coop)
    open_round(auth_client(supervisor), name='November round', stockBoxes=12, deliveryPlace='Cooperative store')
    subject, _, email = sent[0]
    assert subject == 'A supply round is open'
    text = email.plain()
    for expected in ('November round', '12 boxes', 'Cooperative store'):
        assert expected in text
    assert email.button is not None and email.button[1].startswith('http')


def test_saving_a_draft_tells_nobody(auth_client, supervisor, coop, sent):
    farmer_with_room(coop)
    auth_client(supervisor).post(ROUNDS, body(), format='json')
    assert sent == []


# ── the split is confirmed ────────────────────────────────────────────────────

def confirmed(auth_client, supervisor, coop, boxes_by_farmer):
    client = auth_client(supervisor)
    round_id = open_round(client, stockBoxes=10)
    made = []
    for farmer, room, asked in boxes_by_farmer:
        made.append(auth_client(farmer).post(f'{ROUNDS}/{round_id}/requests', {'roomId': room.pk, 'boxes': asked}, format='json').json()['data']['id'])
    client.post(f'{ROUNDS}/{round_id}/action', {'action': 'close'}, format='json')
    return client, round_id, made


def test_confirming_tells_each_requester_once_with_their_own_result(auth_client, supervisor, coop, sent):
    a, room_a = farmer_with_room(coop)
    b, room_b = farmer_with_room(coop)
    c, room_c = farmer_with_room(coop)
    client, round_id, (qa, qb, qc) = confirmed(auth_client, supervisor, coop, [(a, room_a, 2), (b, room_b, 3), (c, room_c, 1)])
    sent.clear()
    client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [
        {'id': qa, 'boxes': 2}, {'id': qb, 'boxes': 1}, {'id': qc, 'boxes': 0, 'declineNote': 'No space in your room'},
    ]}, format='json')
    by_to = {to[0]: (subject, email) for subject, to, email in sent}
    assert sorted(by_to) == sorted([a.email, b.email, c.email]) and len(sent) == 3
    assert by_to[a.email][0] == 'Your egg request was approved'
    assert by_to[b.email][0] == 'Your egg request was partly approved'
    assert by_to[c.email][0] == 'Your egg request was not approved'
    assert '2 boxes' in by_to[a.email][1].plain() and 'Cooperative store' in by_to[a.email][1].plain()
    assert '1 box' in by_to[b.email][1].plain() and '3 boxes' in by_to[b.email][1].plain()
    assert 'No space in your room' in by_to[c.email][1].plain()


def test_a_request_left_on_the_waiting_list_is_told_so(auth_client, supervisor, coop, sent):
    a, room_a = farmer_with_room(coop)
    client, round_id, (qa,) = confirmed(auth_client, supervisor, coop, [(a, room_a, 2)])
    sent.clear()
    client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': qa, 'boxes': 0}]}, format='json')
    assert sent[0][0] == 'You are on the waiting list for eggs'


def test_a_second_confirmation_sends_nothing_more(auth_client, supervisor, coop, sent):
    a, room_a = farmer_with_room(coop)
    client, round_id, (qa,) = confirmed(auth_client, supervisor, coop, [(a, room_a, 2)])
    client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': qa, 'boxes': 2}]}, format='json')
    sent.clear()
    assert client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': qa, 'boxes': 1}]}, format='json').status_code == 409
    assert sent == []


def test_a_note_with_markup_is_plain_text_in_the_mail(auth_client, supervisor, coop, sent):
    a, room_a = farmer_with_room(coop)
    client, round_id, (qa,) = confirmed(auth_client, supervisor, coop, [(a, room_a, 2)])
    sent.clear()
    client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': qa, 'boxes': 0, 'declineNote': '<script>x</script> sorry'}]}, format='json')
    html = sent[0][2].html()
    assert '&lt;script&gt;' in html and '<script>' not in html


# ── a round is cancelled ──────────────────────────────────────────────────────

def test_cancelling_tells_the_farmers_with_a_waiting_request_the_reason(auth_client, supervisor, coop, sent):
    a, room_a = farmer_with_room(coop)
    b, _ = farmer_with_room(coop)
    client = auth_client(supervisor)
    round_id = open_round(client)
    auth_client(a).post(f'{ROUNDS}/{round_id}/requests', {'roomId': room_a.pk, 'boxes': 1}, format='json')
    sent.clear()
    client.post(f'{ROUNDS}/{round_id}/action', {'action': 'cancel', 'note': 'No eggs this month'}, format='json')
    assert recipients(sent) == [a.email]
    assert sent[0][0] == 'A supply round was cancelled' and 'No eggs this month' in sent[0][2].plain()


# ── receipt for a farmer ──────────────────────────────────────────────────────

def test_a_supervisor_recording_the_receipt_tells_the_farmer_and_the_farmers_own_tap_tells_nobody(auth_client, supervisor, coop, sent):
    a, room_a = farmer_with_room(coop)
    b, room_b = farmer_with_room(coop)
    client, round_id, (qa, qb) = confirmed(auth_client, supervisor, coop, [(a, room_a, 2), (b, room_b, 2)])
    client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': qa, 'boxes': 2}, {'id': qb, 'boxes': 2}]}, format='json')
    sent.clear()
    auth_client(a).post(f'/api/supply/requests/{qa}/receipt', {'boxes': 2, 'condition': 'good'}, format='json')
    assert sent == []
    client.post(f'/api/supply/requests/{qb}/receipt', {'boxes': 1, 'condition': 'damaged'}, format='json')
    assert recipients(sent) == [b.email]
    assert sent[0][0] == 'Your eggs were recorded as received' and 'Claire Uwimana' in sent[0][2].plain()


# ── a mail that fails ─────────────────────────────────────────────────────────

def test_a_mail_that_cannot_be_sent_does_not_fail_any_request(auth_client, supervisor, coop, monkeypatch):
    a, room_a = farmer_with_room(coop)

    def broken(*args, **kwargs):
        raise RuntimeError('mail server down')

    monkeypatch.setattr('supply.round_notify.send_email_async', broken)
    client = auth_client(supervisor)
    round_id = client.post(ROUNDS, body(), format='json').json()['data']['id']
    assert client.post(f'{ROUNDS}/{round_id}/action', {'action': 'open'}, format='json').status_code == 200
    request_id = auth_client(a).post(f'{ROUNDS}/{round_id}/requests', {'roomId': room_a.pk, 'boxes': 2}, format='json').json()['data']['id']
    client.post(f'{ROUNDS}/{round_id}/action', {'action': 'close'}, format='json')
    assert client.post(f'{ROUNDS}/{round_id}/confirm', {'items': [{'id': request_id, 'boxes': 2}]}, format='json').status_code == 200
    assert client.post(f'/api/supply/requests/{request_id}/receipt', {'boxes': 2, 'condition': 'good'}, format='json').status_code == 201
