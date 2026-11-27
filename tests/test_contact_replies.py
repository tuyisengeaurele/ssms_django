"""Messages are answered by sending a reply from the app (tests/test_contact_reply_api.py). The mark that said by hand
that a message had been answered is gone; messages marked before keep who and when."""
from datetime import datetime, timezone

import pytest

from contacts.models import ContactMessage
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

LIST = '/api/admin/contacts'


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN', name='Aline Uwase')


def message(**over):
    fields = dict(name='Aline', email='aline@example.rw', subject='Training', message='We are twelve farmers in Gatsibo.')
    fields.update(over)
    return ContactMessage.objects.create(**fields)


def listed(client):
    response = client.get(LIST)
    assert response.status_code == 200
    return response.json()['data']


def test_a_new_message_has_not_been_answered(auth_client, admin):
    message()
    row = listed(auth_client(admin))[0]
    assert row['repliedAt'] is None and row['repliedBy'] is None and row['replies'] == []


def test_a_mark_made_by_hand_before_still_says_who_and_when(auth_client, admin):
    message(replied_by=admin, replied_at=datetime(2026, 11, 1, 8, 0, tzinfo=timezone.utc))
    row = listed(auth_client(admin))[0]
    assert row['repliedBy'] == {'id': admin.pk, 'name': 'Aline Uwase'} and row['repliedAt'].startswith('2026-11-01')
    assert row['replies'] == []


@pytest.mark.parametrize('method', ['post', 'delete'])
def test_a_message_can_no_longer_be_marked_by_hand(auth_client, admin, method):
    msg = message()
    assert getattr(auth_client(admin), method)(f'{LIST}/{msg.pk}/replied').status_code == 404
    msg.refresh_from_db()
    assert msg.replied_at is None


def test_a_person_who_is_not_an_admin_cannot_read_the_messages(auth_client):
    assert auth_client(UserFactory(role='SUPERVISOR')).get(LIST).status_code == 403
