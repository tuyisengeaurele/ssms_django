"""Sending a message once, saying how far one has read, and the check for what is new.

What the check does to the idle clock is in test_background_poll_idle.py."""
import uuid
from datetime import timedelta

import pytest
from django.db.models.query import QuerySet
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from audit_log.models import AuditLog
from messaging.models import Conversation, Message
from tests.factories import UserFactory
from tests.support_helpers import acting, admin_and_person
from tests.test_messaging_access import client, farmer_of, say, supervisor_of, talk, world  # noqa: F401 (world is a fixture)

pytestmark = pytest.mark.django_db

SEND = '/api/messages/send'
READ = '/api/messages/read'
UPDATES = '/api/messages/updates'


def key():
    return str(uuid.uuid4())


def send(user_or_client, **body):
    sender = user_or_client if isinstance(user_or_client, APIClient) else client(user_or_client)
    return sender.post(SEND, {'client_id': key(), 'body': 'Hello.', **body}, format='json')


def sent(user, **body):
    response = send(user, **body)
    assert response.status_code == 201, response.data
    return response.data['data']


@pytest.fixture
def pair():
    """A cooperative with a supervisor and a farmer who have not written to each other yet."""
    from tests.factories import CooperativeFactory

    class Pair:
        coop = CooperativeFactory()
    p = Pair()
    p.supervisor = supervisor_of(p.coop)
    p.farmer = farmer_of(p.coop)
    return p


# ── sending ─────────────────────────────────────────────────────────────────────────────────

def test_a_farmers_first_message_makes_the_conversation_and_the_next_one_uses_it(pair):
    first = sent(pair.farmer, body='The worms stopped eating.')
    second = sent(pair.farmer, body='Since this morning.')
    [conversation] = Conversation.objects.all()
    assert (conversation.farmer_id, conversation.cooperative_id) == (pair.farmer.pk, pair.coop.pk)
    assert first['conversation']['id'] == second['conversation']['id'] == conversation.pk
    assert first['message']['body'] == 'The worms stopped eating.' and first['message']['mine'] and first['message']['from_farmer']
    assert first['message']['sender']['id'] == pair.farmer.pk
    assert conversation.last_message_at == Message.objects.latest('created_at').created_at


def test_a_supervisor_writes_to_a_farmer_by_farmer_and_then_by_conversation(pair):
    first = sent(pair.supervisor, farmer_id=pair.farmer.pk, body='I will come today.')
    second = sent(pair.supervisor, conversation_id=first['conversation']['id'], body='At noon.')
    assert second['conversation']['id'] == first['conversation']['id'] and not second['message']['from_farmer']
    answer = sent(pair.farmer, conversation_id=first['conversation']['id'], body='Thank you.')
    assert answer['conversation']['id'] == first['conversation']['id']
    assert Message.objects.count() == 3 and Conversation.objects.count() == 1


def test_two_first_messages_at_once_make_one_conversation(pair, monkeypatch):
    existing = talk(pair.farmer)
    real = QuerySet.get
    missed = []

    def get(queryset, *args, **kwargs):
        # The first look finds nothing, as it would if the other request had not saved yet.
        if queryset.model is Conversation and kwargs.get('farmer') == pair.farmer and not missed:
            missed.append(True)
            raise Conversation.DoesNotExist
        return real(queryset, *args, **kwargs)

    monkeypatch.setattr(QuerySet, 'get', get)
    assert sent(pair.farmer)['conversation']['id'] == existing.pk
    assert missed and Conversation.objects.count() == 1


# The message arrived and the answer was lost, so the page sends it again.
def test_sending_the_same_message_again_saves_nothing_twice(pair):
    client_id = key()
    sender = client(pair.farmer)
    first = send(sender, client_id=client_id, body='Once.')
    again = send(sender, client_id=client_id, body='Once.')
    changed = send(sender, client_id=client_id, body='Different words.')
    assert (first.status_code, again.status_code, changed.status_code) == (201, 200, 200)
    assert again.data['data']['message']['id'] == first.data['data']['message']['id'] == changed.data['data']['message']['id']
    assert changed.data['data']['message']['body'] == 'Once.' and Message.objects.count() == 1


def test_a_retry_still_answers_after_the_farmer_has_moved(pair):
    from tests.factories import CooperativeFactory

    client_id = key()
    first = sent(pair.farmer, client_id=client_id)
    pair.farmer.cooperative = CooperativeFactory()
    pair.farmer.save()
    again = send(pair.farmer, client_id=client_id)
    assert again.status_code == 200 and again.data['data']['message']['id'] == first['message']['id']
    assert Conversation.objects.count() == 1


def test_the_same_number_from_the_other_side_or_to_another_farmer_is_another_message(pair):
    client_id = key()
    neighbour = farmer_of(pair.coop)
    first = sent(pair.supervisor, farmer_id=pair.farmer.pk, client_id=client_id)
    sent(pair.farmer, client_id=client_id)
    other = sent(pair.supervisor, farmer_id=neighbour.pk, client_id=client_id)
    assert other['conversation']['id'] != first['conversation']['id'] and Message.objects.count() == 3


def test_the_words_are_kept_as_typed_apart_from_the_ends(pair):
    message = sent(pair.farmer, body='  One\r\nTwo\rThree\n\n<b>four</b>\t5  \n')['message']
    assert message['body'] == 'One\nTwo\nThree\n\n<b>four</b>\t5'
    assert sent(pair.farmer, body='x' * 2000)['message']['body'] == 'x' * 2000


@pytest.mark.parametrize('body, code', [
    ('', 'message_empty'), ('   \n\t ', 'message_empty'), ('x' * 2001, 'message_too_long'),
    ('bell\x07', 'invalid_input'), ('nul\x00', 'invalid_input'), (12345, 'invalid_input'), (None, 'invalid_input'),
])
def test_words_that_are_refused_save_nothing(pair, body, code):
    response = send(pair.farmer, body=body)
    assert response.status_code == 422 and response.data['code'] == code, response.data
    assert not Conversation.objects.exists()


@pytest.mark.parametrize('client_id', [None, '', 'short', 'x' * 37, 'has space here', 'semi;colon-here'])
def test_a_message_needs_a_number_of_its_own(pair, client_id):
    response = client(pair.farmer).post(SEND, {'body': 'Hello.', **({} if client_id is None else {'client_id': client_id})}, format='json')
    assert response.status_code == 422 and 'client_id' in response.data['errors']
    assert not Message.objects.exists()


def test_a_supervisor_names_exactly_one_place_and_a_farmer_never_names_a_farmer(pair):
    conversation = talk(pair.farmer)
    assert send(pair.supervisor).status_code == 422
    assert send(pair.supervisor, farmer_id=pair.farmer.pk, conversation_id=conversation.pk).status_code == 422
    assert send(pair.farmer, farmer_id=pair.farmer.pk).status_code == 422
    assert not Message.objects.exists()


def test_nobody_writes_outside_their_cooperative(world):  # noqa: F811
    strangers = [
        (world.other_supervisor, {'conversation_id': world.talk.pk}),
        (world.other_supervisor, {'farmer_id': world.farmer.pk}),
        (world.other_farmer, {'conversation_id': world.talk.pk}),
        (world.supervisor, {'farmer_id': world.other_farmer.pk}),
        (world.supervisor, {'farmer_id': world.supervisor.pk}),
        (world.supervisor, {'farmer_id': 'nothing-here'}),
        (supervisor_of(None), {'farmer_id': world.farmer.pk}),
    ]
    for user, where in strangers:
        response = send(user, **where)
        assert response.status_code == 404, (where, response.data)
    assert Message.objects.count() == 2


def test_a_farmer_with_no_cooperative_is_told_to_join_one():
    response = send(UserFactory(cooperative=None))
    assert response.status_code == 409 and response.data['code'] == 'message_no_cooperative'


def test_a_cooperative_that_is_switched_off_takes_no_first_message(pair):
    pair.coop.is_active = False
    pair.coop.save()
    assert send(pair.farmer).data['code'] == 'message_no_cooperative'


# The farmer can move while a supervisor still has the conversation open.
@pytest.mark.parametrize('what', ['moved', 'removed', 'closing'])
def test_once_closed_neither_side_can_add_to_it(pair, what):
    from tests.factories import CooperativeFactory

    conversation = talk(pair.farmer)
    reader, writer = client(pair.supervisor), client(pair.farmer)
    if what == 'closing':
        type(pair.farmer).objects.filter(pk=pair.farmer.pk).update(deletion_requested_at=timezone.now())
    else:
        pair.farmer.cooperative = CooperativeFactory() if what == 'moved' else None
        pair.farmer.save()
    response = send(reader, conversation_id=conversation.pk)
    assert response.status_code == 409 and response.data['code'] == 'conversation_closed', response.data
    if what != 'closing':   # an account being closed is held at its own screen before this
        assert send(writer, conversation_id=conversation.pk).data['code'] == 'conversation_closed'
    assert not Message.objects.exists()


def test_a_supervisor_cannot_start_with_a_farmer_who_is_leaving(pair):
    type(pair.farmer).objects.filter(pk=pair.farmer.pk).update(deletion_requested_at=timezone.now())
    assert send(pair.supervisor, farmer_id=pair.farmer.pk).data['code'] == 'conversation_closed'
    assert not Conversation.objects.exists()


@pytest.mark.parametrize('mode', ['view', 'edit'])
def test_support_access_cannot_send_or_mark_or_check(pair, mode):
    admin, person = admin_and_person()
    person.cooperative = pair.coop
    person.save()
    token, _ = acting(admin, person, mode=mode)
    visitor = APIClient()
    visitor.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    for response in (send(visitor), visitor.post(READ, {}, format='json'), visitor.get(UPDATES)):
        assert response.status_code == 403 and response.json()['code'] == 'support_blocked'
    assert not Message.objects.exists()


def test_the_words_are_not_written_into_the_audit_log(pair):
    sent(pair.farmer, body='A very private sentence.')
    for entry in AuditLog.objects.all():
        assert 'private sentence' not in f'{entry.detail} {entry.changes}'


# ── limits ──────────────────────────────────────────────────────────────────────────────────

def test_twenty_a_minute_for_each_person(pair):
    sender = client(pair.farmer)
    assert [send(sender).status_code for _ in range(20)] == [201] * 20
    assert send(sender).status_code == 429
    assert send(pair.supervisor, farmer_id=pair.farmer.pk).status_code == 201


def test_there_is_a_limit_for_a_day_too(pair, monkeypatch, settings):
    assert settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['message_day'] == '300/day'
    monkeypatch.setitem(SimpleRateThrottle.THROTTLE_RATES, 'message_day', '2/day')
    sender = client(pair.farmer)
    assert [send(sender).status_code for _ in range(3)] == [201, 201, 429]


# ── how far one has read ────────────────────────────────────────────────────────────────────

def read(user, conversation, message):
    return client(user).post(READ, {'conversation_id': conversation.pk, 'message_id': message.pk}, format='json')


def marks(conversation):
    conversation.refresh_from_db()
    return conversation.farmer_read_at, conversation.staff_read_at


def test_sending_marks_the_senders_side_read_up_to_that_message(world):  # noqa: F811
    message = sent(world.supervisor, conversation_id=world.talk.pk)['message']
    farmer_mark, staff_mark = marks(world.talk)
    assert farmer_mark is None and staff_mark == Message.objects.get(pk=message['id']).created_at


def test_reading_moves_this_sides_mark_forward_and_never_back(world):  # noqa: F811
    response = read(world.farmer, world.talk, world.answer)
    assert response.status_code == 200 and response.data['data'] == {'unread_total': 0}
    assert marks(world.talk) == (world.answer.created_at, None)
    assert read(world.farmer, world.talk, world.said).status_code == 200
    assert marks(world.talk) == (world.answer.created_at, None)
    read(world.supervisor, world.talk, world.said)
    assert marks(world.talk)[1] == world.said.created_at


def test_reading_answers_how_many_are_still_unread_everywhere(world):  # noqa: F811
    second = farmer_of(world.coop)
    say(talk(second), second, 'One.')
    say(Conversation.objects.get(farmer=second), second, 'Two.')
    assert read(world.supervisor, world.talk, world.answer).data['data'] == {'unread_total': 2}


def test_a_place_that_is_not_theirs_cannot_be_marked(world):  # noqa: F811
    elsewhere = say(talk(world.other_farmer), world.other_farmer, 'Elsewhere.')
    assert read(world.other_supervisor, world.talk, world.said).status_code == 404
    assert read(world.supervisor, world.talk, elsewhere).status_code == 404
    assert client(world.supervisor).post(READ, {}, format='json').status_code == 422
    assert marks(world.talk) == (None, None)


# ── the check every 30 seconds ──────────────────────────────────────────────────────────────

def updates(user, **query):
    response = client(user).get(UPDATES, query)
    assert response.status_code == 200, response.data
    return response.data['data']


def test_the_check_says_how_many_are_unread(world):  # noqa: F811
    assert updates(world.supervisor) == {'unread_total': 1, 'conversation': None}
    assert updates(world.farmer) == {'unread_total': 1, 'conversation': None}
    assert updates(world.other_supervisor) == {'unread_total': 0, 'conversation': None}
    assert updates(supervisor_of(None))['unread_total'] == 0


def test_the_check_brings_what_is_new_in_the_open_conversation(world):  # noqa: F811
    news = updates(world.farmer, conversation=world.talk.pk, since=world.answer.created_at.isoformat())['conversation']
    assert set(news) == {'is_open', 'other_read_at', 'messages'} and news['is_open'] is True
    # The newest one it already has comes again. The page drops it by its id.
    assert [m['id'] for m in news['messages']] == [world.answer.pk]
    later = say(world.talk, world.supervisor, 'On my way.', at=timezone.now() + timedelta(seconds=30))
    news = updates(world.farmer, conversation=world.talk.pk, since=world.answer.created_at.isoformat())['conversation']
    assert [m['id'] for m in news['messages']] == [world.answer.pk, later.pk]


# One message can be saved a moment before another and finish after it.
def test_the_check_looks_a_little_further_back_than_asked(world):  # noqa: F811
    since = timezone.now()
    slow = say(world.talk, world.supervisor, 'Saved just before.', at=since - timedelta(seconds=10))
    old = say(world.talk, world.supervisor, 'Long before.', at=since - timedelta(seconds=40))
    got = [m['id'] for m in updates(world.farmer, conversation=world.talk.pk, since=since.isoformat())['conversation']['messages']]
    assert slow.pk in got and old.pk not in got


def test_the_check_sends_fifty_at_most_the_oldest_of_the_new_first(world):  # noqa: F811
    start = timezone.now()
    for i in range(60):
        say(world.talk, world.supervisor, f'new {i}', at=start + timedelta(seconds=i))
    got = updates(world.farmer, conversation=world.talk.pk, since=(start + timedelta(seconds=14)).isoformat())['conversation']['messages']
    assert [m['body'] for m in got] == [f'new {i}' for i in range(0, 50)]


@pytest.mark.parametrize('query', [{}, {'since': ''}, {'since': 'yesterday'}, {'since': '2026-11-27T10:00:00'}, {'since': '2026-13-01T10:00:00+00:00'}])
def test_a_watched_conversation_needs_a_moment_with_its_zone(world, query):  # noqa: F811
    response = client(world.farmer).get(UPDATES, {'conversation': world.talk.pk, **query})
    assert response.status_code == 422, response.data


def test_the_check_shows_nothing_that_is_not_theirs(world):  # noqa: F811
    response = client(world.other_supervisor).get(UPDATES, {'conversation': world.talk.pk, 'since': timezone.now().isoformat()})
    assert response.status_code == 404


# ── in the reader's language ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('lang, sentence', [
    ('fr', "Écrivez d'abord un message."),
    ('rw', 'Banza wandike ubutumwa.'),
])
def test_what_is_wrong_is_said_in_the_screens_language(pair, lang, sentence):
    response = client(pair.farmer).post(SEND, {'body': '', 'client_id': key()}, format='json', HTTP_ACCEPT_LANGUAGE=lang)
    assert response.data['errors']['body'] == [sentence]
