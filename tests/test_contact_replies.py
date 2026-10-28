"""An admin marks a contact message as answered, so the team can see which ones still wait for a reply."""
import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from audit_log.models import AuditLog
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


def answered(client, msg):
    return client.post(f'{LIST}/{msg.pk}/replied')


def unanswered(client, msg):
    return client.delete(f'{LIST}/{msg.pk}/replied')


def listed(client):
    response = client.get(LIST)
    assert response.status_code == 200
    return response.json()['data']


# ── what the list says ──────────────────────────────────────────────────────

def test_a_new_message_has_not_been_answered(auth_client, admin):
    message()
    row = listed(auth_client(admin))[0]
    assert row['repliedAt'] is None and row['repliedBy'] is None


def test_an_answered_message_says_who_answered_and_when(auth_client, admin):
    msg = message()
    answered(auth_client(admin), msg)
    row = listed(auth_client(admin))[0]
    assert row['repliedBy'] == {'id': admin.pk, 'name': 'Aline Uwase'}
    assert row['repliedAt']


def test_the_list_costs_the_same_however_many_messages_were_answered(auth_client, admin):
    def cost():
        with CaptureQueriesContext(connection) as queries:
            auth_client(admin).get(LIST)
        return len(queries)

    first = message()
    answered(auth_client(admin), first)
    few = cost()
    for _ in range(6):
        answered(auth_client(admin), message())
    assert cost() == few


# ── marking a message answered ──────────────────────────────────────────────

def test_an_admin_marks_a_message_answered(auth_client, admin):
    msg = message()
    response = answered(auth_client(admin), msg)
    assert response.status_code == 200
    data = response.json()['data']
    assert data['id'] == msg.pk
    assert data['repliedBy'] == {'id': admin.pk, 'name': 'Aline Uwase'} and data['repliedAt']
    msg.refresh_from_db()
    assert msg.replied_by_id == admin.pk and msg.replied_at is not None


def test_answering_a_message_also_marks_it_read(auth_client, admin):
    msg = message()
    answered(auth_client(admin), msg)
    msg.refresh_from_db()
    assert msg.is_read is True


def test_marking_it_answered_twice_keeps_the_first_answer(auth_client, admin):
    msg = message()
    first = answered(auth_client(admin), msg).json()['data']
    second_admin = UserFactory(role='ADMIN', name='Eric Niyonzima')
    second = answered(auth_client(second_admin), msg).json()['data']
    assert second['repliedBy']['name'] == 'Aline Uwase'
    assert second['repliedAt'] == first['repliedAt']


def test_an_answered_mark_can_be_removed(auth_client, admin):
    msg = message()
    answered(auth_client(admin), msg)
    response = unanswered(auth_client(admin), msg)
    assert response.status_code == 200
    assert response.json()['data']['repliedBy'] is None and response.json()['data']['repliedAt'] is None
    msg.refresh_from_db()
    assert msg.replied_by_id is None and msg.replied_at is None


def test_removing_the_mark_does_not_make_the_message_unread(auth_client, admin):
    msg = message()
    answered(auth_client(admin), msg)
    unanswered(auth_client(admin), msg)
    msg.refresh_from_db()
    assert msg.is_read is True


def test_removing_a_mark_that_was_never_there_is_fine(auth_client, admin):
    assert unanswered(auth_client(admin), message()).status_code == 200


def test_an_unknown_message_is_not_found(auth_client, admin):
    client = auth_client(admin)
    assert client.post(f'{LIST}/99999/replied').status_code == 404
    assert client.delete(f'{LIST}/99999/replied').status_code == 404


def test_the_answer_of_one_message_does_not_touch_another(auth_client, admin):
    one, two = message(subject='One'), message(subject='Two')
    answered(auth_client(admin), one)
    two.refresh_from_db()
    assert two.replied_at is None and two.is_read is False


# ── who may ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_an_admin_may_mark_a_message(auth_client, role):
    msg = message()
    client = auth_client(UserFactory(role=role))
    assert answered(client, msg).status_code == 403
    assert unanswered(client, msg).status_code == 403
    msg.refresh_from_db()
    assert msg.replied_at is None


def test_a_stranger_gets_nothing(api_client):
    msg = message()
    assert api_client.post(f'{LIST}/{msg.pk}/replied').status_code == 401
    assert api_client.delete(f'{LIST}/{msg.pk}/replied').status_code == 401


def test_a_person_who_is_not_an_admin_cannot_learn_who_answered(auth_client, admin):
    msg = message()
    answered(auth_client(admin), msg)
    assert auth_client(UserFactory(role='SUPERVISOR')).get(LIST).status_code == 403


# ── the audit log ───────────────────────────────────────────────────────────

def test_marking_and_unmarking_are_written_to_the_audit_log(auth_client, admin):
    msg = message()
    answered(auth_client(admin), msg)
    unanswered(auth_client(admin), msg)
    entries = AuditLog.objects.filter(resource='ContactMessage').order_by('id')
    assert [e.action for e in entries] == ['UPDATE', 'UPDATE']
    assert all(e.resource_id == str(msg.pk) for e in entries)
    assert 'answered' in entries[0].detail and 'answered' in entries[1].detail


def test_what_the_visitor_wrote_stays_out_of_the_audit_log(auth_client, admin):
    msg = message(message='A private question about my farm.')
    answered(auth_client(admin), msg)
    assert 'private question' not in AuditLog.objects.get(resource='ContactMessage').detail


def test_marking_an_already_answered_message_writes_nothing_new(auth_client, admin):
    msg = message()
    answered(auth_client(admin), msg)
    answered(auth_client(admin), msg)
    assert AuditLog.objects.filter(resource='ContactMessage').count() == 1
