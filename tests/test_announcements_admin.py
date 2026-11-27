"""An admin writes, changes and ends the SSMS team's announcements. Nobody else may, and nothing is deleted."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from announcements.models import Announcement
from audit_log.models import AuditLog
from tests.factories import UserFactory
from tests.mfa_helpers import client_with, enable_factor, session_for

pytestmark = pytest.mark.django_db

ADMIN_LIST = '/api/admin/announcements'
CURRENT = '/api/announcements'
PUBLIC = '/api/announcements/public'


def admin_client(name='Aline Admin'):
    admin = UserFactory(role='ADMIN', name=name)
    enable_factor(admin)
    return admin, client_with(admin, session_for(admin, verified_minutes_ago=0))


def at(hours):
    """A moment `hours` from now, written the way the website sends it: Kigali time with its offset."""
    return (timezone.now() + timedelta(hours=hours)).astimezone(timezone.get_fixed_timezone(120)).isoformat()


def body(**changes):
    return {'kind': 'maintenance', 'text_en': 'SSMS is off on Saturday night.', 'show_from': at(-1), 'show_until': at(24), **changes}


def made(client, **changes):
    response = client.post(ADMIN_LIST, body(**changes), format='json')
    assert response.status_code == 201, response.data
    return response.data['data']


def one(pk):
    return f'{ADMIN_LIST}/{pk}'


def end(client, pk):
    return client.post(f'{one(pk)}/end', {}, format='json')


def seen_by_visitors():
    return [row['text']['en'] for row in APIClient().get(PUBLIC).data['data']]


# ── who may ─────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_an_admin_may(role):
    user = UserFactory(role=role)
    client = client_with(user, session_for(user))
    _, admin = admin_client()
    row = made(admin)
    for response in (
        client.get(ADMIN_LIST), client.post(ADMIN_LIST, body(), format='json'),
        client.patch(one(row['id']), {'text_en': 'mine now'}, format='json'), end(client, row['id']),
    ):
        assert response.status_code == 403
    assert Announcement.objects.get().text_en == 'SSMS is off on Saturday night.'


def test_a_stranger_is_told_to_sign_in():
    assert APIClient().get(ADMIN_LIST).status_code == 401
    assert APIClient().post(ADMIN_LIST, body(), format='json').status_code == 401


# ── writing one ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('starts, status', [(-1, 'showing'), (2, 'scheduled')])
def test_a_new_one_says_whether_it_is_showing_or_waiting(starts, status):
    admin, client = admin_client()
    row = made(client, show_from=at(starts), show_public=True, text_fr='SSMS sera arrêté.', text_rw='SSMS izaba ifunze.')
    assert row['status'] == status and row['show_public'] is True and row['ended_at'] is None
    assert row['created_by'] == {'id': admin.pk, 'name': 'Aline Admin'}
    assert row['text'] == {'en': 'SSMS is off on Saturday night.', 'fr': 'SSMS sera arrêté.', 'rw': 'SSMS izaba ifunze.'}
    assert row['version'] == 1 and row['show_from'] and row['show_until']
    assert (seen_by_visitors() == [row['text']['en']]) is (status == 'showing')


def test_it_is_not_for_visitors_unless_ticked():
    _, client = admin_client()
    assert made(client)['show_public'] is False and seen_by_visitors() == []


@pytest.mark.parametrize('changes, field', [
    ({'text_en': ''}, 'text_en'),
    ({'text_en': '   \n  '}, 'text_en'),
    ({'text_en': 'x' * 201}, 'text_en'),
    ({'text_fr': 'x' * 201}, 'text_fr'),
    ({'kind': 'party'}, 'kind'),
    ({'show_from': '2027-01-01T10:00:00'}, 'show_from'),
    ({'show_until': 'next week'}, 'show_until'),
])
def test_what_is_refused_saves_nothing(changes, field):
    _, client = admin_client()
    response = client.post(ADMIN_LIST, body(**changes), format='json')
    assert response.status_code == 422 and field in response.data['errors'], response.data
    assert not Announcement.objects.exists()


@pytest.mark.parametrize('missing', ['kind', 'text_en', 'show_from', 'show_until'])
def test_these_cannot_be_left_out(missing):
    _, client = admin_client()
    data = body()
    del data[missing]
    response = client.post(ADMIN_LIST, data, format='json')
    assert response.status_code == 422 and missing in response.data['errors']


SAME_MOMENT = at(5)


@pytest.mark.parametrize('changes, code', [
    ({'show_from': SAME_MOMENT, 'show_until': SAME_MOMENT}, 'announcement_times'),
    ({'show_from': at(5), 'show_until': at(4)}, 'announcement_times'),
    ({'show_from': at(-5), 'show_until': at(-1)}, 'announcement_past'),
])
def test_the_times_must_make_sense(changes, code):
    _, client = admin_client()
    response = client.post(ADMIN_LIST, body(**changes), format='json')
    assert response.status_code == 422 and response.data['code'] == code, response.data
    assert not Announcement.objects.exists()


def test_the_words_are_kept_as_one_tidy_line_and_markup_as_words():
    _, client = admin_client()
    row = made(client, text_en='  SSMS is off.\n\n  <b>Save</b>   your work. ')
    assert row['text']['en'] == 'SSMS is off. <b>Save</b> your work.'


def test_two_hundred_characters_fit_once_tidied():
    _, client = admin_client()
    assert made(client, text_en='  ' + 'x' * 200 + '\n')['text']['en'] == 'x' * 200


def test_the_names_the_website_sends_are_understood():
    _, client = admin_client()
    response = client.post(ADMIN_LIST, {'kind': 'urgent', 'textEn': 'Now.', 'textFr': 'Maintenant.', 'textRw': 'Nonaha.',
                                        'showPublic': True, 'showFrom': at(-1), 'showUntil': at(2)}, format='json')
    assert response.status_code == 201, response.json()
    kept = Announcement.objects.get()
    assert (kept.text_en, kept.text_fr, kept.text_rw, kept.show_public) == ('Now.', 'Maintenant.', 'Nonaha.', True)


def test_the_list_is_newest_start_first_and_says_how_each_stands():
    _, client = admin_client()
    made(client, text_en='showing', show_from=at(-2))
    made(client, text_en='scheduled', show_from=at(3))
    gone = made(client, text_en='ended', show_from=at(-4))
    end(client, gone['id'])
    old = Announcement.objects.create(
        kind='information', text_en='run out', show_from=timezone.now() - timedelta(days=3), show_until=timezone.now() - timedelta(days=2),
    )
    rows = client.get(ADMIN_LIST).data['data']
    assert [(r['text']['en'], r['status']) for r in rows] == [
        ('scheduled', 'scheduled'), ('showing', 'showing'), ('ended', 'ended'), ('run out', 'ended'),
    ]
    assert rows[-1]['id'] == old.pk and rows[-1]['created_by'] is None


# ── changing one ────────────────────────────────────────────────────────────────────────────

# Somebody who closed it must see it again when it says something new, and only then.
@pytest.mark.parametrize('changes, version', [
    ({'text_en': 'It moved to Sunday.'}, 2),
    ({'text_fr': 'Dimanche.'}, 2),
    ({'text_rw': 'Ku cyumweru.'}, 2),
    ({'kind': 'urgent'}, 2),
    ({'show_until': at(48)}, 1),
    ({'show_public': True}, 1),
    ({'text_en': '  SSMS is off on   Saturday night. '}, 1),
])
def test_the_version_goes_up_only_for_a_new_type_or_new_words(changes, version):
    _, client = admin_client()
    row = made(client)
    response = client.patch(one(row['id']), changes, format='json')
    assert response.status_code == 200, response.data
    assert response.data['data']['version'] == version


def test_a_change_is_checked_against_what_is_already_there():
    _, client = admin_client()
    row = made(client, show_from=at(5), show_until=at(10))
    response = client.patch(one(row['id']), {'show_until': at(4)}, format='json')
    assert response.status_code == 422 and response.data['code'] == 'announcement_times'
    assert client.patch(one(row['id']), {'show_from': at(11)}, format='json').data['code'] == 'announcement_times'


def test_a_change_cannot_end_it_in_the_past_by_the_back_door():
    _, client = admin_client()
    row = made(client, show_from=at(-5))
    assert client.patch(one(row['id']), {'show_until': at(-1)}, format='json').data['code'] == 'announcement_past'


def test_who_changed_it_last_is_kept():
    _, first = admin_client()
    row = made(first)
    second, other = admin_client('Bosco Admin')
    other.patch(one(row['id']), {'text_en': 'Changed.'}, format='json')
    assert Announcement.objects.get().updated_by == second


# ── ending one ──────────────────────────────────────────────────────────────────────────────

def test_end_now_takes_it_down_and_keeps_it():
    _, client = admin_client()
    row = made(client, show_public=True)
    response = end(client, row['id'])
    assert response.status_code == 200 and response.data['data']['status'] == 'ended' and response.data['data']['ended_at']
    assert seen_by_visitors() == []
    user = UserFactory()
    assert client_with(user, session_for(user)).get(CURRENT).data['data'] == []
    assert Announcement.objects.count() == 1


def test_one_that_was_still_waiting_can_be_called_off():
    _, client = admin_client()
    row = made(client, show_from=at(5), show_until=at(6))
    assert end(client, row['id']).data['data']['status'] == 'ended'


def test_an_ended_one_cannot_be_changed_or_ended_again():
    _, client = admin_client()
    row = made(client)
    end(client, row['id'])
    for response in (end(client, row['id']), client.patch(one(row['id']), {'text_en': 'back'}, format='json')):
        assert response.status_code == 409 and response.data['code'] == 'announcement_ended'


def test_one_that_ran_out_cannot_be_brought_back():
    _, client = admin_client()
    old = Announcement.objects.create(
        kind='information', text_en='old', show_from=timezone.now() - timedelta(days=3), show_until=timezone.now() - timedelta(days=2),
    )
    response = client.patch(one(old.pk), {'show_until': at(5)}, format='json')
    assert response.status_code == 409 and response.data['code'] == 'announcement_ended'


def test_one_that_does_not_exist():
    _, client = admin_client()
    assert end(client, 999999).status_code == 404
    assert client.patch(one(999999), {'text_en': 'x'}, format='json').status_code == 404


def test_nothing_can_be_deleted():
    _, client = admin_client()
    row = made(client)
    assert client.delete(one(row['id'])).status_code == 405


# ── on record ───────────────────────────────────────────────────────────────────────────────

def test_every_change_is_in_the_audit_log_with_the_old_and_new_words():
    admin, client = admin_client()
    row = made(client)
    client.patch(one(row['id']), {'text_en': 'It moved to Sunday.'}, format='json')
    end(client, row['id'])
    entries = list(AuditLog.objects.filter(resource='Announcement', resource_id=str(row['id'])).order_by('created_at', 'pk'))
    assert [e.action for e in entries] == ['CREATE', 'UPDATE', 'UPDATE']
    assert {e.user_id for e in entries} == {admin.pk}
    assert entries[0].changes['text_en']['to'] == 'SSMS is off on Saturday night.'
    assert entries[1].changes['text_en'] == {'from': 'SSMS is off on Saturday night.', 'to': 'It moved to Sunday.'}
    assert 'Ended' in entries[2].detail


# ── in the reader's language ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('lang, sentence', [
    ('fr', 'La fin doit venir après le début.'),
    ('rw', "Iherezo rigomba kuza nyuma y'itangiriro."),
])
def test_what_is_wrong_is_said_in_the_screens_language(lang, sentence):
    _, client = admin_client()
    response = client.post(ADMIN_LIST, body(show_from=at(5), show_until=at(4)), format='json', HTTP_ACCEPT_LANGUAGE=lang)
    assert response.data['errors']['show_until'] == [sentence]
