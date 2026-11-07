"""Who is told about an allowance: the reviewers when a request waits, the farmer when it is decided or changed.

Each person gets their own email, so nobody sees another's address. A mail that cannot be sent never fails the request,
because the decision is already saved and the person will see it in the app.
"""
import pytest

from supply import allowance
from tests.factories import CooperativeFactory, UserFactory

pytestmark = pytest.mark.django_db

REQUESTS = '/api/supply/allowance/requests'


@pytest.fixture
def sent(monkeypatch):
    """Every email the code tried to send, as (subject, recipients, Email)."""
    mails = []
    monkeypatch.setattr('supply.notify.send_email_async', lambda subject, to, email, **kw: mails.append((subject, to, email)))
    return mails


@pytest.fixture
def world():
    coop = CooperativeFactory()
    first = UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')
    second = UserFactory(role='SUPERVISOR', cooperative=coop)
    farmer = UserFactory(role='FARMER', cooperative=coop, name='Aline Uwase')
    allowance.set_start(farmer, coop, 2, by=None)
    return coop, first, second, farmer


def ask(client, boxes=4, reason='I built a second house'):
    return client.post(REQUESTS, {'boxesAsked': boxes, 'reason': reason}, format='json')


def decide(client, request_id, **body):
    return client.post(f'{REQUESTS}/{request_id}/decision', body, format='json')


def recipients(sent):
    return sorted(address for _, to, _ in sent for address in to)


# ── the reviewers ─────────────────────────────────────────────────────────────

def test_a_request_tells_each_supervisor_of_the_cooperative_in_a_mail_of_their_own(auth_client, world, sent):
    _, first, second, farmer = world
    UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())
    assert ask(auth_client(farmer)).status_code == 201
    assert recipients(sent) == sorted([first.email, second.email])
    assert all(len(to) == 1 for _, to, _ in sent)


def test_the_reviewers_mail_says_who_how_many_and_why_and_has_one_button(auth_client, world, sent):
    _, _, _, farmer = world
    ask(auth_client(farmer), boxes=5, reason='I built a second house')
    subject, _, email = sent[0]
    assert subject == 'An allowance change waits for your decision'
    text = email.plain()
    for expected in ('Aline Uwase', 'I built a second house', '2 boxes', '5 boxes'):
        assert expected in text
    assert email.button is not None and email.button[1].startswith('http')


def test_a_cooperative_with_no_supervisor_tells_every_active_admin(auth_client, sent):
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    first, second = UserFactory(role='ADMIN'), UserFactory(role='ADMIN')
    UserFactory(role='ADMIN', is_active=False)
    ask(auth_client(farmer))
    assert recipients(sent) == sorted([first.email, second.email])
    assert 'no supervisor' in sent[0][2].plain().lower()


def test_a_withdrawal_tells_nobody(auth_client, world, sent):
    _, _, _, farmer = world
    client = auth_client(farmer)
    request_id = ask(client).json()['data']['id']
    sent.clear()
    assert client.delete(f'{REQUESTS}/{request_id}').status_code == 200
    assert sent == []


# ── the farmer ────────────────────────────────────────────────────────────────

def test_an_approval_tells_the_farmer_once_with_the_amount_granted(auth_client, world, sent):
    _, first, _, farmer = world
    request_id = ask(auth_client(farmer), boxes=6).json()['data']['id']
    sent.clear()
    decide(auth_client(first), request_id, decision='approve', boxes=3, note='Three for now')
    assert len(sent) == 1
    subject, to, email = sent[0]
    assert to == [farmer.email] and subject == 'Your allowance request was approved'
    text = email.plain()
    assert '3 boxes' in text and 'Three for now' in text and 'Claire Uwimana' in text


def test_a_decline_tells_the_farmer_why(auth_client, world, sent):
    _, first, _, farmer = world
    request_id = ask(auth_client(farmer)).json()['data']['id']
    sent.clear()
    decide(auth_client(first), request_id, decision='decline', note='Not this season')
    subject, to, email = sent[0]
    assert to == [farmer.email] and subject == 'Your allowance request was not approved'
    assert 'Not this season' in email.plain()


def test_a_second_decision_sends_no_second_mail(auth_client, world, sent):
    _, first, second, farmer = world
    request_id = ask(auth_client(farmer)).json()['data']['id']
    sent.clear()
    assert decide(auth_client(first), request_id, decision='approve').status_code == 200
    assert decide(auth_client(second), request_id, decision='decline', note='Too late').status_code == 409
    assert [to for _, to, _ in sent] == [[farmer.email]]


def test_a_lowering_tells_the_farmer_with_the_reason(auth_client, world, sent):
    _, first, _, farmer = world
    auth_client(first).patch(f'/api/supply/allowance/farmers/{farmer.pk}', {'boxes': 1, 'reason': 'Outbreak last month'}, format='json')
    assert len(sent) == 1
    subject, to, email = sent[0]
    assert to == [farmer.email] and subject == 'Your allowance was lowered'
    assert 'Outbreak last month' in email.plain() and '1 box' in email.plain()


def test_an_admin_raising_it_says_raised(auth_client, world, sent):
    _, _, _, farmer = world
    auth_client(UserFactory(role='ADMIN')).patch(f'/api/supply/allowance/farmers/{farmer.pk}', {'boxes': 5, 'reason': 'Agreed with the cooperative'}, format='json')
    assert sent[0][0] == 'Your allowance was raised'


def test_a_reason_with_markup_is_plain_text_in_both_mails(auth_client, world, sent):
    _, first, _, farmer = world
    request_id = ask(auth_client(farmer), reason='<script>x</script> more room').json()['data']['id']
    reviewer_html = sent[0][2].html()
    assert '&lt;script&gt;' in reviewer_html and '<script>' not in reviewer_html
    sent.clear()
    decide(auth_client(first), request_id, decision='decline', note='<b>no</b> thanks')
    farmer_html = sent[0][2].html()
    assert '&lt;b&gt;no&lt;/b&gt;' in farmer_html and '<b>no</b>' not in farmer_html


# ── a mail that fails ─────────────────────────────────────────────────────────

def test_a_mail_that_cannot_be_sent_does_not_fail_the_request(auth_client, world, monkeypatch):
    _, first, _, farmer = world

    def broken(*args, **kwargs):
        raise RuntimeError('mail server down')

    monkeypatch.setattr('supply.notify.send_email_async', broken)
    created = ask(auth_client(farmer))
    assert created.status_code == 201
    request_id = created.json()['data']['id']
    assert decide(auth_client(first), request_id, decision='approve').status_code == 200
    assert allowance.current(farmer)['boxes'] == 4
    patched = auth_client(first).patch(f'/api/supply/allowance/farmers/{farmer.pk}', {'boxes': 1, 'reason': 'Outbreak last month'}, format='json')
    assert patched.status_code == 200
