"""Every email SSMS really sends carries the shared look: an HTML part, the logo, a footer and a reason."""
from unittest import mock

import pytest
from django.core import mail

from alerts.disease import raise_disease_alert
from alerts.utils import check_room_alerts
from batches.placement import place_batch
from core.mail import send_email
from farms.models import RearingRoom
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


def assert_branded(message, reason_starts):
    (html, kind), = message.alternatives
    assert kind == 'text/html'
    for text in (message.body, html):
        assert 'Smart Sericulture Management System' in text
        assert 'smartsericulturerw@gmail.com' in text
        assert reason_starts in text
    assert 'cid:' in html
    assert any(getattr(part, 'get_content_maintype', lambda: '')() == 'image' for part in message.attachments)
    assert chr(8212) not in message.body and chr(8211) not in message.body


def test_the_verification_email(api_client):
    api_client.post('/api/auth/register', {'name': 'Alice', 'email': 'alice@test.com', 'password': 'SecurePass1'}, format='json')
    message = mail.outbox[0]
    assert_branded(message, 'You received this because an SSMS account was created with this address.')
    assert '/verify-email?uid=' in message.body


def test_the_password_reset_email(api_client):
    UserFactory(email='known@example.rw')
    api_client.post('/api/auth/password-reset/request', {'email': 'known@example.rw'}, format='json')
    message = mail.outbox[0]
    assert_branded(message, 'You received this because a password reset was requested for this address.')
    assert '/reset-password?uid=' in message.body


def test_the_email_for_a_person_an_admin_added(auth_client):
    admin = auth_client(UserFactory(role='ADMIN'))
    admin.post('/api/admin/users', {'name': 'Aline Uwase', 'email': 'aline@example.rw', 'role': 'FARMER'}, format='json')
    assert_branded(mail.outbox[0], 'You received this because an SSMS account was created for this address.')


def test_the_invitation_email(auth_client):
    coop = CooperativeFactory(name='Gatsibo Silk')
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Mukamana')
    auth_client(supervisor).post('/api/team/invitations', {'email': 'aline@example.rw'}, format='json')
    message = mail.outbox[0]
    assert_branded(message, 'You received this because Claire Mukamana invited this address to join Gatsibo Silk.')
    assert '/join/' in message.body


@pytest.fixture
def mail_now(settings):
    settings.EMAIL_HOST_USER = 'team@example.rw'
    with mock.patch('contacts.views._send_mail_async', side_effect=send_email):
        yield


def test_the_contact_reply_and_the_team_note(api_client, mail_now):
    api_client.post('/api/contact', {
        'name': 'Aline', 'email': 'aline@example.rw', 'subject': 'Training',
        'message': 'We are twelve farmers in Gatsibo and would like a visit.',
    }, format='json')
    reply = next(m for m in mail.outbox if m.to == ['aline@example.rw'])
    note = next(m for m in mail.outbox if m.to == ['team@example.rw'])
    assert_branded(reply, 'You received this because this address was used on the SSMS contact form.')
    assert_branded(note, 'You received this because this is the SSMS contact address.')


def test_the_team_can_answer_the_sender_with_one_click(api_client, mail_now):
    api_client.post('/api/contact', {
        'name': 'Aline', 'email': 'aline@example.rw', 'subject': 'Training',
        'message': 'We are twelve farmers in Gatsibo and would like a visit.',
    }, format='json')
    note = next(m for m in mail.outbox if m.to == ['team@example.rw'])
    assert note.reply_to == ['aline@example.rw']


def test_a_message_with_line_breaks_keeps_them_in_the_html(api_client, mail_now):
    api_client.post('/api/contact', {
        'name': 'Aline', 'email': 'aline@example.rw', 'subject': 'Training',
        'message': 'First line, long enough to count.\nSecond line.',
    }, format='json')
    note = next(m for m in mail.outbox if m.to == ['team@example.rw'])
    assert 'white-space:pre-line' in note.alternatives[0][0]


def test_the_room_alert_email():
    owner = UserFactory(role='FARMER', name='Mugisha Serge', email='serge@example.rw')
    farm = FarmFactory(owner=owner, name='Serge Farm')
    room = RearingRoom.objects.create(farm=farm, name='Rearing house 1')
    place_batch(BatchFactory(farm=farm, stage='PUPA'), room)
    with mock.patch('alerts.utils._send_mail_async', side_effect=send_email):
        check_room_alerts(room.pk, 35.0, 78.0)
    assert_branded(mail.outbox[0], 'You received this because you own Serge Farm on SSMS.')
    assert 'Rearing house 1' in mail.outbox[0].body


def test_the_disease_alert_email():
    owner = UserFactory(role='FARMER', name='Mugisha Serge', email='serge@example.rw')
    batch = BatchFactory(farm=FarmFactory(owner=owner, name='Serge Farm'))
    checker = UserFactory(role='SUPERVISOR')
    with mock.patch('alerts.utils._send_mail_async', side_effect=send_email):
        raise_disease_alert(batch, 'Pebrine', 0.9, checker)
    assert_branded(mail.outbox[0], 'You received this because you own Serge Farm on SSMS.')
    assert 'Pebrine suspected' in mail.outbox[0].body
