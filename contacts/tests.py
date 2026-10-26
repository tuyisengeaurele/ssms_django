from unittest import mock

import pytest
from django.core import mail
from django.core.mail import send_mail

from contacts.models import ContactMessage
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

URL = '/api/contact'

GOOD = {
    'name': 'Aline Uwase',
    'email': 'aline@example.rw',
    'subject': 'Setting up our cooperative',
    'message': 'We would like to start with twelve farmers in Gatsibo.',
}


@pytest.fixture(autouse=True)
def mail_now(settings):
    """Send the mail inside the request, so a test can look in the outbox straight away."""
    settings.EMAIL_HOST_USER = 'admin@example.rw'
    with mock.patch('contacts.views._send_mail_async', side_effect=lambda *a, **k: send_mail(*a, **k)):
        yield


def post(client, **over):
    return client.post(URL, {**GOOD, **over}, format='json')


def test_a_good_message_is_stored_and_acknowledged(api_client):
    response = post(api_client)
    assert response.status_code == 201
    row = ContactMessage.objects.get()
    assert response.json()['data']['id'] == row.id
    assert (row.name, row.email) == ('Aline Uwase', 'aline@example.rw')


def test_the_sender_gets_a_fixed_reply_that_repeats_nothing_they_wrote(api_client):
    post(api_client, name='Click here now', subject='Win a prize', message='Visit http://evil.example/now to claim it')
    reply = next(m for m in mail.outbox if m.to == ['aline@example.rw'])
    assert reply.subject == 'We received your message'
    for typed in ('Click here now', 'Win a prize', 'evil.example', 'claim it'):
        assert typed not in reply.body
        assert typed not in reply.subject


def test_the_team_still_sees_everything_that_was_written(api_client):
    post(api_client)
    note = next(m for m in mail.outbox if m.to == ['admin@example.rw'])
    assert 'twelve farmers in Gatsibo' in note.body
    assert 'aline@example.rw' in note.body


def test_a_filled_honeypot_looks_like_success_but_stores_and_sends_nothing(api_client):
    response = post(api_client, website='http://spam.example')
    assert response.status_code == 201
    assert ContactMessage.objects.count() == 0
    assert mail.outbox == []


@pytest.mark.throttle
def test_the_sixth_message_in_an_hour_is_refused(api_client):
    codes = [post(api_client).status_code for _ in range(6)]
    assert codes == [201] * 5 + [429]


@pytest.mark.parametrize('field, value', [
    pytest.param('email', 'not-an-email', id='email is not an address'),
    pytest.param('name', 'x' * 121, id='name too long'),
    pytest.param('subject', 'x' * 201, id='subject too long'),
    pytest.param('message', 'x' * 5001, id='message too long'),
    pytest.param('message', 'too short', id='message too short'),
    pytest.param('name', '', id='name empty'),
    pytest.param('subject', '', id='subject empty'),
])
def test_bad_input_is_a_422_and_nothing_is_stored(api_client, field, value):
    assert post(api_client, **{field: value}).status_code == 422
    assert ContactMessage.objects.count() == 0
    assert mail.outbox == []


def test_a_missing_field_is_a_422(api_client):
    body = {k: v for k, v in GOOD.items() if k != 'subject'}
    assert api_client.post(URL, body, format='json').status_code == 422


@pytest.mark.parametrize('field', ['name', 'subject', 'email'])
def test_line_breaks_cannot_be_used_to_inject_mail_headers(api_client, field):
    value = 'aline@example.rw\r\nBcc: victim@example.rw' if field == 'email' else 'Hello\r\nBcc: victim@example.rw'
    assert post(api_client, **{field: value}).status_code == 422
    assert mail.outbox == []


def test_the_message_itself_may_have_line_breaks(api_client):
    assert post(api_client, message='First line.\nSecond line, long enough to count.').status_code == 201


def test_the_admin_inbox_endpoints_are_still_admin_only(auth_client, api_client):
    assert api_client.get('/api/admin/contacts').status_code == 401
    assert auth_client(UserFactory()).get('/api/admin/contacts').status_code == 403
    assert auth_client(UserFactory(role='ADMIN')).get('/api/admin/contacts').status_code == 200
