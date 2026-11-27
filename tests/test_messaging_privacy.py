"""How long messages are kept, and what a person's data download holds of them."""
import json
from datetime import timedelta
from pathlib import Path

import pytest
from django.core.management import call_command
from django.utils import timezone

from messaging.models import Conversation, Message
from tests.test_messaging_access import farmer_of, say, talk, world  # noqa: F401 (world is a fixture)
from users.closure import anonymise
from users.export import build_export

pytestmark = pytest.mark.django_db


def old(conversation, sender, words, days):
    return say(conversation, sender, words, at=timezone.now() - timedelta(days=days))


def run(capsys):
    call_command('prune_messages')
    return capsys.readouterr().out


# ── how long they are kept ──────────────────────────────────────────────────────────────────

def test_a_message_is_kept_for_a_year(settings):
    assert settings.MESSAGE_RETENTION_DAYS == 365


def test_older_than_a_year_goes_and_a_day_younger_stays(world, capsys):  # noqa: F811
    old(world.talk, world.farmer, 'Too old.', 366)
    keeps = old(world.talk, world.farmer, 'Still within the year.', 364)
    said = run(capsys)
    assert set(Message.objects.values_list('body', flat=True)) == {keeps.body, world.said.body, world.answer.body}
    assert 'Removed 1 message and 0 empty conversations.' in said


def test_a_conversation_with_nothing_left_goes_and_one_with_something_left_keeps_its_latest_time(world, capsys):  # noqa: F811
    stale = talk(farmer_of(world.coop))
    old(stale, stale.farmer, 'Long ago.', 400)
    old(stale, world.supervisor, 'Also long ago.', 390)
    Conversation.objects.filter(pk=stale.pk).update(last_message_at=timezone.now() - timedelta(days=390))
    latest = Conversation.objects.get(pk=world.talk.pk).last_message_at
    said = run(capsys)
    assert not Conversation.objects.filter(pk=stale.pk).exists()
    assert Conversation.objects.get(pk=world.talk.pk).last_message_at == latest
    assert 'Removed 2 messages and 1 empty conversation.' in said


def test_the_number_of_days_is_a_setting(world, settings, capsys):  # noqa: F811
    settings.MESSAGE_RETENTION_DAYS = 1
    old(world.talk, world.farmer, 'Two days old.', 2)
    run(capsys)
    assert 'Two days old.' not in Message.objects.values_list('body', flat=True)


def test_running_it_with_nothing_to_remove_changes_nothing(world, capsys):  # noqa: F811
    assert 'Removed 0 messages and 0 empty conversations.' in run(capsys)
    assert Message.objects.count() == 2


def test_the_nightly_job_runs_it_after_the_accounts():
    workflow = (Path(__file__).resolve().parent.parent / '.github' / 'workflows' / 'jobs-nightly.yml').read_text(encoding='utf-8')
    assert 'Remove messages older than a year' in workflow
    assert workflow.index('python manage.py anonymise_accounts') < workflow.index('python manage.py prune_messages')


# ── the data download ───────────────────────────────────────────────────────────────────────

def test_a_farmers_download_has_both_sides_of_their_conversations_without_the_other_persons_details(world):  # noqa: F811
    data = build_export(world.farmer)['messages']
    assert data == [
        {'cooperative': 'Abahuje', 'from': 'you', 'body': 'The worms stopped eating.', 'sent_at': world.said.created_at.isoformat()},
        {'cooperative': 'Abahuje', 'from': 'cooperative', 'body': 'I will come today.', 'sent_at': world.answer.created_at.isoformat()},
    ]
    text = json.dumps(data)
    for theirs in (world.supervisor.pk, world.supervisor.name, world.supervisor.email, '788000111', world.talk.pk, world.said.pk):
        assert theirs not in text


def test_a_farmers_download_keeps_the_conversations_of_a_cooperative_they_have_left(world):  # noqa: F811
    world.farmer.cooperative = world.other
    world.farmer.save()
    say(talk(world.farmer), world.farmer, 'Hello, new cooperative.')
    assert [(m['cooperative'], m['body']) for m in build_export(world.farmer)['messages']] == [
        ('Abahuje', 'The worms stopped eating.'), ('Abahuje', 'I will come today.'), ('Twisungane', 'Hello, new cooperative.'),
    ]


def test_a_supervisors_download_has_only_what_they_wrote(world):  # noqa: F811
    data = build_export(world.supervisor)['messages']
    assert data == [{'cooperative': 'Abahuje', 'body': 'I will come today.', 'sent_at': world.answer.created_at.isoformat()}]
    text = json.dumps(data)
    for theirs in ('worms', world.farmer.pk, world.farmer.name, world.farmer.email):
        assert theirs not in text


def test_somebody_elses_download_has_none_of_it(world):  # noqa: F811
    for person in (world.other_farmer, world.other_supervisor):
        assert build_export(person)['messages'] == []


def test_the_messages_stay_when_an_account_is_closed(world):  # noqa: F811
    anonymise(world.farmer)
    assert Message.objects.filter(conversation=world.talk).count() == 2
