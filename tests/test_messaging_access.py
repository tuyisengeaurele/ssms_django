"""Who may read a conversation between a farmer and their cooperative's supervisors. Nobody else, ever."""
import uuid
from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from messaging.models import Conversation, Message
from tests.factories import CooperativeFactory, UserFactory
from tests.mfa_helpers import client_with, enable_factor, session_for
from tests.support_helpers import acting, admin_and_person
from users.closure import anonymise

pytestmark = pytest.mark.django_db

LIST = '/api/messages/conversations'


def one(pk):
    return f'{LIST}/{pk}'


def client(user):
    return client_with(user, session_for(user))


def supervisor_of(cooperative, **fields):
    return UserFactory(role='SUPERVISOR', cooperative=cooperative, **fields)


def farmer_of(cooperative, **fields):
    return UserFactory(role='FARMER', cooperative=cooperative, **fields)


def talk(farmer, cooperative=None, **fields):
    return Conversation.objects.create(cooperative=cooperative or farmer.cooperative, farmer=farmer, **fields)


def say(conversation, sender, words, minutes_ago=0, at=None):
    when = at or timezone.now() - timedelta(minutes=minutes_ago)
    message = Message.objects.create(
        conversation=conversation, sender=sender, from_farmer=sender.pk == conversation.farmer_id, body=words,
        client_id=uuid.uuid4().hex, created_at=when,
    )
    Conversation.objects.filter(pk=conversation.pk, last_message_at__lt=when).update(last_message_at=when)
    return message


@pytest.fixture
def world():
    class World:
        coop = CooperativeFactory(name='Abahuje')
        other = CooperativeFactory(name='Twisungane')
    w = World()
    w.supervisor = supervisor_of(w.coop, name='Sara Supervisor', email='sara@example.rw', phone='+250788000111')
    w.farmer = farmer_of(w.coop, name='Fidele Farmer')
    w.other_supervisor = supervisor_of(w.other)
    w.other_farmer = farmer_of(w.other)
    w.talk = talk(w.farmer, last_message_at=timezone.now() - timedelta(days=1))
    w.said = say(w.talk, w.farmer, 'The worms stopped eating.', minutes_ago=10)
    w.answer = say(w.talk, w.supervisor, 'I will come today.', minutes_ago=5)
    return w


def rows(user):
    response = client(user).get(LIST)
    assert response.status_code == 200, response.data
    return response.data['data']


def page(user, conversation, **query):
    response = client(user).get(one(conversation.pk), query)
    assert response.status_code == 200, response.data
    return response.data['data']


# ── what the two sides see ──────────────────────────────────────────────────────────────────

def test_both_sides_see_the_conversation_and_who_wrote_what(world):
    for user, mine in ((world.farmer, [True, False]), (world.supervisor, [False, True])):
        [row] = rows(user)
        assert set(row) == {'id', 'farmer', 'cooperative', 'is_open', 'unread', 'last_message'}
        assert row['id'] == world.talk.pk and row['is_open'] is True
        assert row['farmer'] == {'id': world.farmer.pk, 'name': 'Fidele Farmer', 'photo_url': None, 'former': False}
        assert row['cooperative'] == {'id': world.coop.pk, 'name': 'Abahuje'}
        assert row['last_message'] == {
            'preview': 'I will come today.', 'from_farmer': False, 'mine': mine[1], 'created_at': world.answer.created_at.isoformat(),
        }
        data = page(user, world.talk)
        assert set(data) == {'conversation', 'messages', 'has_older', 'other_read_at'}
        assert data['conversation']['id'] == world.talk.pk
        assert [(m['body'], m['from_farmer'], m['mine']) for m in data['messages']] == [
            ('The worms stopped eating.', True, mine[0]), ('I will come today.', False, mine[1]),
        ]
        assert data['messages'][1]['sender'] == {'id': world.supervisor.pk, 'name': 'Sara Supervisor', 'former': False}
        assert data['messages'][0]['created_at'] == world.said.created_at.isoformat() and data['has_older'] is False


def test_a_farmer_is_not_sent_a_supervisors_email_or_number(world):
    for url in (LIST, one(world.talk.pk)):
        text = client(world.farmer).get(url).content.decode()
        assert 'sara@example.rw' not in text and '788000111' not in text


def test_the_preview_is_the_start_of_the_last_message_on_one_line(world):
    words = 'First line\n\n   second line ' + 'x' * 200
    say(world.talk, world.farmer, words)
    assert rows(world.supervisor)[0]['last_message']['preview'] == ' '.join(words.split())[:140]


def test_the_latest_conversation_comes_first(world):
    later = farmer_of(world.coop)
    newer = talk(later, last_message_at=timezone.now() - timedelta(days=2))
    say(newer, later, 'Hello.', minutes_ago=1)
    assert [r['id'] for r in rows(world.supervisor)] == [newer.pk, world.talk.pk]


def test_each_side_is_told_when_the_other_last_read(world):
    farmer_read, staff_read = timezone.now() - timedelta(minutes=3), timezone.now() - timedelta(minutes=2)
    Conversation.objects.filter(pk=world.talk.pk).update(farmer_read_at=farmer_read, staff_read_at=staff_read)
    assert page(world.farmer, world.talk)['other_read_at'] == staff_read.isoformat()
    assert page(world.supervisor, world.talk)['other_read_at'] == farmer_read.isoformat()


# A supervisor who chooses Message beside a farmer needs that farmer's conversation, however far down the list it is.
def test_the_list_can_be_asked_for_one_farmers_conversation(world):
    neighbour = farmer_of(world.coop)
    say(talk(neighbour), neighbour, 'Another.')
    found = client(world.supervisor).get(LIST, {'farmer': world.farmer.pk}).data
    assert [r['id'] for r in found['data']] == [world.talk.pk] and found['pagination']['totalItems'] == 1
    assert client(world.supervisor).get(LIST, {'farmer': 'nothing-here'}).data['data'] == []


def test_asking_for_a_farmer_reaches_nothing_new(world):
    for outsider in (world.other_supervisor, world.other_farmer, farmer_of(world.coop)):
        assert client(outsider).get(LIST, {'farmer': world.farmer.pk}).data['data'] == []


# ── everybody else ──────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('who', ['other_supervisor', 'other_farmer', 'loose_supervisor', 'neighbour'])
def test_nobody_outside_sees_it_or_learns_that_it_exists(world, who):
    people = {
        'other_supervisor': lambda: world.other_supervisor,
        'other_farmer': lambda: world.other_farmer,
        'loose_supervisor': lambda: supervisor_of(None),
        # In the same cooperative, and still not theirs.
        'neighbour': lambda: farmer_of(world.coop),
    }
    user = people[who]()
    assert rows(user) == []
    assert client(user).get(one(world.talk.pk)).status_code == 404
    assert client(user).get(one('nothing-here')).status_code == 404


def test_an_admin_has_no_way_in(world):
    admin = UserFactory(role='ADMIN')
    enable_factor(admin)
    reader = client_with(admin, session_for(admin, verified_minutes_ago=0))
    for url in (LIST, one(world.talk.pk)):
        assert reader.get(url).status_code == 403


def test_a_stranger_is_told_to_sign_in(world):
    for url in (LIST, one(world.talk.pk)):
        assert APIClient().get(url).status_code == 401


@pytest.mark.parametrize('mode', ['view', 'edit'])
@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_support_access_never_shows_a_conversation(world, mode, role):
    admin, person = admin_and_person(role)
    person.cooperative = world.coop
    person.save()
    conversation = world.talk
    if role == 'FARMER':
        conversation = talk(person, last_message_at=timezone.now())
        say(conversation, person, 'Private.')
    token, _ = acting(admin, person, mode=mode)
    visitor = APIClient()
    visitor.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    for url in (LIST, one(conversation.pk)):
        response = visitor.get(url)
        assert response.status_code == 403 and response.json()['code'] == 'support_blocked', response.json()


@pytest.mark.parametrize('fields, code', [
    ({'phone': None}, 'phone_required'),
    ({'deletion_requested_at': 'now'}, 'deletion_scheduled'),
])
def test_an_account_held_at_another_screen_is_refused(world, fields, code):
    for name, value in fields.items():
        setattr(world.farmer, name, timezone.now() if value == 'now' else value)
    world.farmer.save()
    for url in (LIST, one(world.talk.pk)):
        response = client(world.farmer).get(url)
        assert response.status_code == 403 and response.json()['code'] == code


# ── moving, leaving, closing ────────────────────────────────────────────────────────────────

def test_a_farmer_who_moves_keeps_the_conversation_read_only_and_coming_back_opens_it(world):
    world.farmer.cooperative = world.other
    world.farmer.save()
    for user in (world.farmer, world.supervisor):
        assert [(r['id'], r['is_open']) for r in rows(user)] == [(world.talk.pk, False)]
        assert len(page(user, world.talk)['messages']) == 2
    assert rows(world.other_supervisor) == []
    assert client(world.other_supervisor).get(one(world.talk.pk)).status_code == 404

    world.farmer.cooperative = world.coop
    world.farmer.save()
    assert [r['is_open'] for r in rows(world.supervisor)] == [True]


def test_a_supervisor_who_moves_loses_the_old_conversations_at_once(world):
    reader = client(world.supervisor)
    world.supervisor.cooperative = world.other
    world.supervisor.save()
    assert reader.get(LIST).data['data'] == []
    assert reader.get(one(world.talk.pk)).status_code == 404


@pytest.mark.parametrize('what', ['cooperative_off', 'farmer_off', 'closing'])
def test_a_conversation_is_closed_when_either_end_is_gone(world, what):
    if what == 'cooperative_off':
        world.coop.is_active = False
        world.coop.save()
    else:
        changes = {'is_active': False} if what == 'farmer_off' else {'deletion_requested_at': timezone.now()}
        type(world.farmer).objects.filter(pk=world.farmer.pk).update(**changes)
    assert [r['is_open'] for r in rows(world.supervisor)] == [False]


def test_a_closed_account_is_a_former_member_and_the_words_stay(world):
    anonymise(world.farmer)
    data = page(world.supervisor, world.talk)
    assert data['messages'][0]['sender'] == {'id': world.farmer.pk, 'name': '', 'former': True}
    assert data['messages'][0]['body'] == 'The worms stopped eating.'
    assert data['conversation']['is_open'] is False
    assert data['conversation']['farmer'] == {'id': world.farmer.pk, 'name': '', 'photo_url': None, 'former': True}


def test_a_message_whose_writer_row_is_gone_has_no_sender(world):
    Message.objects.filter(pk=world.answer.pk).update(sender=None)
    assert page(world.farmer, world.talk)['messages'][1]['sender'] is None


# ── unread ──────────────────────────────────────────────────────────────────────────────────

def unread(user):
    return {r['id']: r['unread'] for r in rows(user)}


def test_unread_counts_only_what_the_other_side_wrote_since_this_side_read(world):
    second = say(world.talk, world.supervisor, 'Bring fresh leaves.', minutes_ago=4)
    say(world.talk, world.supervisor, 'And open the window.', minutes_ago=3)
    assert unread(world.farmer) == {world.talk.pk: 3} and unread(world.supervisor) == {world.talk.pk: 1}
    Conversation.objects.filter(pk=world.talk.pk).update(farmer_read_at=second.created_at, staff_read_at=world.said.created_at)
    assert unread(world.farmer) == {world.talk.pk: 1} and unread(world.supervisor) == {world.talk.pk: 0}


def test_the_supervisors_of_a_cooperative_share_one_read_mark(world):
    colleague = supervisor_of(world.coop)
    assert unread(colleague) == unread(world.supervisor) == {world.talk.pk: 1}
    Conversation.objects.filter(pk=world.talk.pk).update(staff_read_at=timezone.now())
    assert unread(colleague) == {world.talk.pk: 0}


# ── older messages ──────────────────────────────────────────────────────────────────────────

def test_older_messages_come_fifty_at_a_time_with_no_gap_and_no_repeat(world):
    start = timezone.now() - timedelta(hours=10)
    # Several share one moment, and one of those groups lies across the edge between two pages.
    for i in range(118):
        say(world.talk, world.farmer, f'note {i}', at=start + timedelta(seconds=i // 7))
    everything = [m.pk for m in Message.objects.filter(conversation=world.talk).order_by('created_at', 'id')]
    assert len(everything) == 120

    collected, before = [], None
    while True:
        data = page(world.supervisor, world.talk, **({'before': before} if before else {}))
        ids = [m['id'] for m in data['messages']]
        assert len(ids) <= 50
        collected = ids + collected
        if not data['has_older']:
            break
        before = ids[0]
    assert collected == everything


def test_the_first_page_is_the_latest_fifty_oldest_first(world):
    for i in range(60):
        say(world.talk, world.farmer, f'note {i}', at=timezone.now() + timedelta(seconds=i))
    data = page(world.supervisor, world.talk)
    assert [m['body'] for m in data['messages']] == [f'note {i}' for i in range(10, 60)] and data['has_older'] is True


def test_a_place_in_another_conversation_is_not_a_place_in_this_one(world):
    elsewhere = say(talk(world.other_farmer, last_message_at=timezone.now()), world.other_farmer, 'Elsewhere.')
    for before in (elsewhere.pk, 'nothing-here'):
        assert client(world.supervisor).get(one(world.talk.pk), {'before': before}).status_code == 404


# ── speed ───────────────────────────────────────────────────────────────────────────────────

def test_the_list_asks_no_more_for_ten_conversations_than_for_one(world):
    reader = client(world.supervisor)
    reader.get(LIST)   # the first request also writes the sign in's last activity
    with CaptureQueriesContext(connection) as for_one:
        assert len(reader.get(LIST).data['data']) == 1
    for _ in range(9):
        farmer = farmer_of(world.coop)
        say(talk(farmer, last_message_at=timezone.now()), farmer, 'Hello.')
    with CaptureQueriesContext(connection) as for_ten:
        assert len(reader.get(LIST).data['data']) == 10
    assert len(for_ten) == len(for_one)


def test_the_database_keeps_one_conversation_for_a_farmer_in_a_cooperative(world):
    from django.db import IntegrityError, transaction

    with pytest.raises(IntegrityError), transaction.atomic():
        talk(world.farmer, last_message_at=timezone.now())
