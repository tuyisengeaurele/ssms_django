"""Who is told about a room: the reviewers when a room or a size change waits, the farmer when it is decided.

Each person gets their own email, so one reviewer never sees another's address. A mail that cannot be sent never
fails the request, because the decision is already saved and the person will see it in the app.
"""
from decimal import Decimal

import pytest

from farms.models import RearingRoom
from tests.factories import CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

Approval = RearingRoom.Approval


@pytest.fixture
def sent(monkeypatch):
    """Every email the code tried to send, as (subject, recipients, Email)."""
    mails = []
    monkeypatch.setattr('farms.room_notify.send_email_async', lambda subject, to, email, **kw: mails.append((subject, to, email)))
    return mails


@pytest.fixture
def world():
    coop = CooperativeFactory()
    first = UserFactory(role='SUPERVISOR', cooperative=coop)
    second = UserFactory(role='SUPERVISOR', cooperative=coop)
    farmer = UserFactory(role='FARMER', cooperative=coop)
    return coop, first, second, farmer, FarmFactory(owner=farmer, name='Hillside')


def add(client, farm, **body):
    return client.post(f'/api/farms/{farm.pk}/rooms', {'name': 'Room A', 'areaM2': 12, **body}, format='json')


def room_of(farm, name='Room A', **fields):
    return RearingRoom.objects.create(farm=farm, name=name, area_m2=Decimal('12'), **fields)


def recipients(sent):
    return sorted(address for _, to, _ in sent for address in to)


# ── the reviewers ─────────────────────────────────────────────────────────────

def test_a_new_room_tells_each_supervisor_of_the_cooperative_in_a_mail_of_their_own(auth_client, world, sent):
    _, first, second, farmer, farm = world
    UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())
    assert add(auth_client(farmer), farm).status_code == 201
    assert recipients(sent) == sorted([first.email, second.email])
    assert all(len(to) == 1 for _, to, _ in sent)


def test_the_reviewers_mail_says_who_what_and_how_big_and_has_one_button(auth_client, world, sent):
    _, first, _, farmer, farm = world
    add(auth_client(farmer), farm, name='North house', areaM2=14.5)
    subject, _, email = sent[0]
    assert subject == 'A room waits for your decision'
    text = email.plain()
    for expected in (farmer.name, 'Hillside', 'North house', '14.5'):
        assert expected in text
    assert email.button is not None and email.button[1].startswith('http')


def test_a_cooperative_with_no_supervisor_tells_every_active_admin(auth_client, sent):
    coop = CooperativeFactory()
    farmer = UserFactory(role='FARMER', cooperative=coop)
    farm = FarmFactory(owner=farmer)
    first, second = UserFactory(role='ADMIN'), UserFactory(role='ADMIN')
    UserFactory(role='ADMIN', is_active=False)
    add(auth_client(farmer), farm)
    assert recipients(sent) == sorted([first.email, second.email])
    assert 'no supervisor' in sent[0][2].plain().lower()


def test_a_farmer_in_no_cooperative_tells_the_admins(auth_client, sent):
    farmer = UserFactory(role='FARMER', cooperative=None)
    farm = FarmFactory(owner=farmer)
    admin = UserFactory(role='ADMIN')
    add(auth_client(farmer), farm)
    assert recipients(sent) == [admin.email]


def test_a_room_added_by_an_admin_tells_nobody(auth_client, world, sent):
    _, _, _, _, farm = world
    add(auth_client(UserFactory(role='ADMIN')), farm)
    assert sent == []


def test_a_waiting_size_change_tells_the_reviewers_the_old_and_new_size(auth_client, world, sent):
    _, first, second, farmer, farm = world
    room = room_of(farm)
    auth_client(farmer).patch(f'/api/rooms/{room.pk}', {'areaM2': 20}, format='json')
    assert recipients(sent) == sorted([first.email, second.email])
    subject, _, email = sent[0]
    assert subject == 'A room size change waits for your decision'
    assert '12' in email.plain() and '20' in email.plain()


def test_a_rejected_room_that_is_resubmitted_tells_the_reviewers_again(auth_client, world, sent):
    _, first, second, farmer, farm = world
    room = room_of(farm, approval_status=Approval.REJECTED, review_note='Too small')
    auth_client(farmer).patch(f'/api/rooms/{room.pk}', {'areaM2': 15}, format='json')
    assert recipients(sent) == sorted([first.email, second.email])


def test_renaming_a_room_tells_nobody(auth_client, world, sent):
    _, _, _, farmer, farm = world
    room = room_of(farm, approval_status=Approval.PENDING)
    auth_client(farmer).patch(f'/api/rooms/{room.pk}', {'name': 'New name'}, format='json')
    assert sent == []


# ── the farmer ────────────────────────────────────────────────────────────────

def test_an_approval_tells_the_farmer(auth_client, world, sent):
    _, first, _, farmer, farm = world
    room = room_of(farm, approval_status=Approval.PENDING)
    auth_client(first).post(f'/api/rooms/{room.pk}/review', {'decision': 'approve'}, format='json')
    subject, to, email = sent[0]
    assert to == [farmer.email] and subject == 'Your room was approved'
    assert 'Room A' in email.plain()


def test_a_rejection_tells_the_farmer_why(auth_client, world, sent):
    _, first, _, farmer, farm = world
    room = room_of(farm, approval_status=Approval.PENDING)
    auth_client(first).post(f'/api/rooms/{room.pk}/review', {'decision': 'reject', 'note': 'Too small for a batch'}, format='json')
    subject, to, email = sent[0]
    assert to == [farmer.email] and subject == 'Your room was not approved'
    assert 'Too small for a batch' in email.plain()


def test_a_decision_on_a_size_change_says_so(auth_client, world, sent):
    _, first, _, farmer, farm = world
    room = room_of(farm, pending_area_m2=Decimal('20'))
    auth_client(first).post(f'/api/rooms/{room.pk}/review', {'decision': 'approve'}, format='json')
    subject, _, email = sent[0]
    assert subject == 'Your room size change was approved'
    assert '20' in email.plain()


def test_a_second_decision_on_the_same_room_sends_no_second_mail(auth_client, world, sent):
    _, first, second, farmer, farm = world
    room = room_of(farm, approval_status=Approval.PENDING)
    assert auth_client(first).post(f'/api/rooms/{room.pk}/review', {'decision': 'approve'}, format='json').status_code == 200
    assert auth_client(second).post(f'/api/rooms/{room.pk}/review', {'decision': 'reject', 'note': 'No'}, format='json').status_code == 409
    assert [to for _, to, _ in sent] == [[farmer.email]]


def test_a_note_with_markup_is_plain_text_in_the_mail(auth_client, world, sent):
    _, first, _, _, farm = world
    room = room_of(farm, approval_status=Approval.PENDING)
    auth_client(first).post(f'/api/rooms/{room.pk}/review', {'decision': 'reject', 'note': '<script>x</script> too small'}, format='json')
    html = sent[0][2].html()
    assert '&lt;script&gt;' in html and '<script>' not in html


# ── a mail that fails ─────────────────────────────────────────────────────────

def test_a_mail_that_cannot_be_sent_does_not_fail_the_request(auth_client, world, monkeypatch):
    _, first, _, farmer, farm = world

    def broken(*args, **kwargs):
        raise RuntimeError('mail server down')

    monkeypatch.setattr('farms.room_notify.send_email_async', broken)
    assert add(auth_client(farmer), farm).status_code == 201
    room = room_of(farm, 'Second', approval_status=Approval.PENDING)
    assert auth_client(first).post(f'/api/rooms/{room.pk}/review', {'decision': 'approve'}, format='json').status_code == 200
    room.refresh_from_db()
    assert room.approval_status == Approval.APPROVED
