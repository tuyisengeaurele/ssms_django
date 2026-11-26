"""An admin answers a contact message from the app: the email goes to the address on the message, the reply is saved only
when the email went, and a message gets one reply from the app."""
import threading
import time
from datetime import datetime, timezone
from unittest import mock

import pytest
from django.core import mail
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from contacts.models import ContactMessage, ContactReply
from core.mail import send_email
from logs.models import JobLog
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

LIST = '/api/admin/contacts'
ENGLISH = 'We are twelve farmers in Gatsibo and we would like to know how you can help our cooperative.'
FRENCH = 'Bonjour, je voudrais savoir comment vous pouvez nous aider avec notre coopérative.'
ANSWER = 'Thank you. We can visit you next week.'


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN', name='Aline Uwase')


def message(**over):
    fields = dict(name='Zebedee Typedname', email='visitor@example.rw', subject='Message to SSMS', message=ENGLISH, language='en')
    fields.update(over)
    return ContactMessage.objects.create(**fields)


def url(msg):
    return f'{LIST}/{msg.pk}/replies'


def answer(client, msg, body=ANSWER, **extra):
    return client.post(url(msg), {'body': body, **extra}, format='json')


def listed(client):
    response = client.get(LIST)
    assert response.status_code == 200
    return response.json()['data']


def untouched(msg):
    msg.refresh_from_db()
    return not ContactReply.objects.filter(message=msg).exists() and msg.replied_at is None and msg.is_read is False


# ── the email ───────────────────────────────────────────────────────────────────────────────

def test_a_reply_goes_to_the_address_on_the_message_and_to_nobody_else(auth_client, admin):
    assert answer(auth_client(admin), message()).status_code == 201
    assert len(mail.outbox) == 1
    sent = mail.outbox[0]
    assert sent.to == ['visitor@example.rw']
    assert (sent.cc, sent.bcc, sent.reply_to) == ([], [], [])
    assert sent.subject == 'Re: Message to SSMS'
    assert ANSWER in sent.body and ANSWER in sent.alternatives[0][0]


def test_the_request_cannot_choose_who_receives_the_reply(auth_client, admin):
    response = answer(auth_client(admin), message(), email='other@example.rw', to=['other@example.rw'], bcc='other@example.rw')
    assert response.status_code == 201
    assert mail.outbox[0].recipients() == ['visitor@example.rw']


def test_nothing_the_visitor_typed_is_in_the_reply(auth_client, admin):
    answer(auth_client(admin), message(name='Zebedee Typedname', message=ENGLISH))
    sent = mail.outbox[0]
    for part in (sent.subject, sent.body, sent.alternatives[0][0]):
        assert 'Zebedee' not in part and 'twelve farmers' not in part


# ── what is saved ───────────────────────────────────────────────────────────────────────────

def test_a_sent_reply_is_saved_and_the_message_is_read_and_answered(auth_client, admin):
    msg = message()
    data = answer(auth_client(admin), msg).json()['data']
    reply = ContactReply.objects.get()
    assert (reply.message_id, reply.body, reply.sent_by_id) == (msg.pk, ANSWER, admin.pk)
    msg.refresh_from_db()
    assert msg.is_read is True and msg.replied_by_id == admin.pk and msg.replied_at is not None
    assert data['replies'] == [{'id': reply.pk, 'body': ANSWER, 'sentAt': data['replies'][0]['sentAt'],
                                'sentBy': {'id': admin.pk, 'name': 'Aline Uwase'}}]
    assert datetime.fromisoformat(data['replies'][0]['sentAt']).astimezone(timezone.utc)
    assert data['repliedBy'] == {'id': admin.pk, 'name': 'Aline Uwase'}
    assert listed(auth_client(admin))[0]['replies'] == data['replies']


# ── the language ────────────────────────────────────────────────────────────────────────────

def test_the_reply_goes_out_in_the_language_of_the_message(auth_client, admin):
    answer(auth_client(admin), message(message=FRENCH, language='fr'))
    assert '<html lang="fr">' in mail.outbox[0].alternatives[0][0]


def test_the_admin_can_put_a_wrong_language_right_before_sending(auth_client, admin):
    msg = message(language='fr')
    response = answer(auth_client(admin), msg, language='rw')
    assert response.status_code == 201
    assert '<html lang="rw">' in mail.outbox[0].alternatives[0][0]
    msg.refresh_from_db()
    assert msg.language == 'rw' and response.json()['data']['language'] == 'rw'


@pytest.mark.parametrize('bad', ['de', '', 5, ['fr']])
def test_a_language_we_do_not_have_is_refused(auth_client, admin, bad):
    msg = message()
    response = answer(auth_client(admin), msg, language=bad)
    assert response.status_code == 422 and 'language' in response.json()['errors']
    assert mail.outbox == [] and untouched(msg)


def test_an_older_message_has_its_language_worked_out_when_it_is_listed_and_answered(auth_client, admin):
    msg = message(message=FRENCH, language=None)
    assert listed(auth_client(admin))[0]['language'] == 'fr'
    answer(auth_client(admin), msg)
    assert '<html lang="fr">' in mail.outbox[0].alternatives[0][0]
    msg.refresh_from_db()
    assert msg.language == 'fr'


@pytest.mark.parametrize('text, posted, stored', [
    pytest.param('Muraho, ndashaka kumenya uko mwadufasha mu bworozi bwacu.', 'en', 'rw', id='kinyarwanda from the english page'),
    pytest.param('Demo please', 'fr', 'fr', id='unclear words follow the page'),
    pytest.param('Demo please', 'xx', 'en', id='a page language we do not have'),
])
def test_the_form_stores_the_language_of_a_message(api_client, text, posted, stored):
    api_client.post('/api/contact', {'name': 'A', 'email': 'a@example.rw', 'message': text, 'language': posted}, format='json')
    assert ContactMessage.objects.get().language == stored


# ── the text ────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('body', [
    pytest.param('', id='empty'),
    pytest.param('   \n\t ', id='only spaces'),
    pytest.param('x' * 5001, id='too long'),
    pytest.param('Hello\x00there', id='a nul'),
    pytest.param('Hello\x1b[31m', id='a control character'),
    pytest.param(None, id='nothing'),
    pytest.param(7, id='not text'),
])
def test_a_reply_that_cannot_be_sent_as_text_is_refused(auth_client, admin, body):
    msg = message()
    response = answer(auth_client(admin), msg, body=body)
    assert response.status_code == 422 and 'body' in response.json()['errors']
    assert mail.outbox == [] and untouched(msg)


def test_the_longest_reply_goes(auth_client, admin):
    assert answer(auth_client(admin), message(), body='x' * 5000).status_code == 201


def test_line_breaks_are_kept_in_one_form(auth_client, admin):
    answer(auth_client(admin), message(), body='  First.\r\n\r\nSecond.\rThird.\tEnd.  ')
    assert ContactReply.objects.get().body == 'First.\n\nSecond.\nThird.\tEnd.'


# ── one reply ───────────────────────────────────────────────────────────────────────────────

def test_a_second_reply_is_refused_and_nothing_more_is_sent(auth_client, admin):
    msg = message()
    assert answer(auth_client(admin), msg).status_code == 201
    again = answer(auth_client(UserFactory(role='ADMIN')), msg, body='Another one.')
    assert again.status_code == 409 and again.json()['code'] == 'already_replied'
    assert len(mail.outbox) == 1 and ContactReply.objects.count() == 1


def test_a_message_marked_answered_by_hand_can_still_get_one_reply(auth_client, admin):
    earlier = UserFactory(role='ADMIN', name='Eric Niyonzima')
    msg = message(replied_by=earlier, replied_at=datetime(2026, 11, 1, tzinfo=timezone.utc), is_read=True)
    assert answer(auth_client(admin), msg).status_code == 201
    msg.refresh_from_db()
    assert msg.replied_by_id == admin.pk and msg.replied_at.year == 2026 and msg.replied_at.day != 1


def test_an_unknown_message_is_not_found(auth_client, admin):
    assert auth_client(admin).post(f'{LIST}/99999/replies', {'body': ANSWER}, format='json').status_code == 404
    assert mail.outbox == []


# ── when the email cannot go ────────────────────────────────────────────────────────────────

def failing(text='550 visitor@example.rw refused by smtp.example'):
    return mock.patch('core.mail.EmailMultiAlternatives.send', side_effect=OSError(text))


def test_a_reply_that_could_not_be_sent_is_not_saved_and_marks_nothing(auth_client, admin):
    msg = message()
    with failing():
        response = answer(auth_client(admin), msg)
    assert response.status_code == 502 and response.json()['code'] == 'reply_not_sent'
    for hidden in ('visitor@example.rw', 'smtp.example', 'refused by'):
        assert hidden not in response.content.decode()
    assert untouched(msg)
    assert not AuditLog.objects.filter(resource='ContactMessage').exists()


def test_a_failed_reply_is_still_in_the_job_log(auth_client, admin):
    with failing():
        answer(auth_client(admin), message())
    assert JobLog.objects.filter(kind='email_failed', subject='Re: Message to SSMS').count() == 1


def test_it_can_be_tried_again_after_a_failure(auth_client, admin):
    msg = message()
    with failing():
        answer(auth_client(admin), msg)
    assert answer(auth_client(admin), msg).status_code == 201
    assert ContactReply.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_two_admins_sending_at_the_same_moment_send_one_email(admin):
    msg = message()
    other = UserFactory(role='ADMIN')
    answers = []

    def slow_send(*args, **kwargs):
        time.sleep(0.4)  # long enough for the second request to arrive while the first is still sending
        return send_email(*args, **kwargs)

    def post(who):
        client = APIClient()
        client.force_authenticate(user=who)
        try:
            answers.append(client.post(url(msg), {'body': ANSWER}, format='json').status_code)
        finally:
            connection.close()

    with mock.patch('contacts.views.send_email', side_effect=slow_send):
        threads = [threading.Thread(target=post, args=(who,)) for who in (admin, other)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
    assert sorted(answers) == [201, 409]
    assert len(mail.outbox) == 1 and ContactReply.objects.count() == 1


# ── the audit log, who may, how often ───────────────────────────────────────────────────────

def test_the_audit_log_says_who_answered_which_message_and_never_the_words(auth_client, admin):
    msg = message(message='A private question about our farm and how you can help us.')
    answer(auth_client(admin), msg, body='A private answer.')
    entry = AuditLog.objects.get(resource='ContactMessage')
    assert (entry.action, entry.resource_id) == ('UPDATE', str(msg.pk))
    assert 'private' not in entry.detail and 'visitor@example.rw' not in entry.detail


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_an_admin_may_reply(auth_client, role):
    msg = message()
    assert answer(auth_client(UserFactory(role=role)), msg).status_code == 403
    assert mail.outbox == [] and untouched(msg)


def test_a_stranger_cannot_reply(api_client):
    msg = message()
    assert api_client.post(url(msg), {'body': ANSWER}, format='json').status_code == 401
    assert mail.outbox == []


@pytest.mark.throttle
def test_the_thirty_first_reply_in_an_hour_is_refused(auth_client, admin):
    client = auth_client(admin)
    codes = [answer(client, message()).status_code for _ in range(31)]
    assert codes == [201] * 30 + [429]
    assert len(mail.outbox) == 30


# ── the list ────────────────────────────────────────────────────────────────────────────────

def test_the_list_costs_the_same_however_many_messages_have_replies(auth_client, admin):
    def add():
        msg = message(replied_by=admin, replied_at=datetime(2026, 11, 20, tzinfo=timezone.utc))
        ContactReply.objects.create(message=msg, body='x', sent_by=UserFactory(role='ADMIN'))

    def cost():
        with CaptureQueriesContext(connection) as queries:
            auth_client(admin).get(LIST)
        return len(queries)

    add()
    few = cost()
    for _ in range(6):
        add()
    assert cost() == few


def test_a_reply_by_an_admin_who_has_since_been_removed_keeps_its_words(auth_client, admin):
    msg = message()
    ContactReply.objects.create(message=msg, body='Still here.', sent_by=None)
    row = listed(auth_client(admin))[0]
    assert row['replies'][0]['body'] == 'Still here.' and row['replies'][0]['sentBy'] is None
