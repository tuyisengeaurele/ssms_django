"""Acknowledging an alert, and the comments on it: a supervisor says "I'm on it" and gives advice, the farmer answers."""
from unittest import mock

import pytest
from django.core import mail

from alerts.models import AlertComment, AlertLog
from audit_log.models import AuditLog
from core.mail import send_email
from farms.models import RearingRoom
from tests.factories import AlertLogFactory, BatchFactory, CooperativeFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def coop():
    return CooperativeFactory()


@pytest.fixture
def owner(coop):
    return UserFactory(role='FARMER', cooperative=coop, name='Mugisha Serge', email='serge@example.rw')


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner, name='Serge Farm')


@pytest.fixture
def alert(farm):
    return AlertLogFactory(batch=BatchFactory(farm=farm), type='DISEASE', message='Pebrine suspected in this batch')


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Mukamana')


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN', name='Aline Uwase')


@pytest.fixture(autouse=True)
def mail_now():
    """Send the mail inside the request, so a test can look in the outbox straight away."""
    with mock.patch('alerts.comment_views.send_email_async', side_effect=lambda *a, **k: send_email(*a, **k)):
        yield


def ack(client, alert):
    return client.post(f'/api/alerts/{alert.pk}/acknowledge')


def unack(client, alert):
    return client.delete(f'/api/alerts/{alert.pk}/acknowledge')


def comments(client, alert):
    return client.get(f'/api/alerts/{alert.pk}/comments')


def comment(client, alert, body='Please check the windows.'):
    return client.post(f'/api/alerts/{alert.pk}/comments', {'body': body}, format='json')


# ── acknowledging ───────────────────────────────────────────────────────────

def test_a_supervisor_acknowledges_an_alert_and_it_says_who_and_when(auth_client, supervisor, alert):
    response = ack(auth_client(supervisor), alert)
    assert response.status_code == 200
    data = response.json()['data']
    assert data['acknowledgedBy'] == {'id': supervisor.pk, 'name': 'Claire Mukamana'}
    assert data['acknowledgedAt']
    alert.refresh_from_db()
    assert alert.acknowledged_by_id == supervisor.pk and alert.acknowledged_at is not None


def test_an_admin_may_acknowledge(auth_client, admin, alert):
    assert ack(auth_client(admin), alert).status_code == 200


def test_the_owner_cannot_acknowledge_their_own_alert(auth_client, owner, alert):
    assert ack(auth_client(owner), alert).status_code == 403
    alert.refresh_from_db()
    assert alert.acknowledged_by_id is None


def test_acknowledging_does_not_mark_the_alert_read(auth_client, supervisor, alert):
    ack(auth_client(supervisor), alert)
    alert.refresh_from_db()
    assert alert.is_read is False


def test_marking_an_alert_read_does_not_acknowledge_it(auth_client, owner, alert):
    auth_client(owner).patch(f'/api/alerts/{alert.pk}/read')
    alert.refresh_from_db()
    assert alert.is_read is True and alert.acknowledged_by_id is None


def test_a_second_supervisor_takes_over(auth_client, coop, supervisor, alert):
    other = UserFactory(role='SUPERVISOR', cooperative=coop, name='Eric Niyonzima')
    ack(auth_client(supervisor), alert)
    response = ack(auth_client(other), alert)
    assert response.json()['data']['acknowledgedBy']['name'] == 'Eric Niyonzima'


def test_acknowledging_twice_by_the_same_person_keeps_the_first_time(auth_client, supervisor, alert):
    client = auth_client(supervisor)
    first = ack(client, alert).json()['data']['acknowledgedAt']
    second = ack(client, alert).json()['data']['acknowledgedAt']
    assert first == second


def test_an_acknowledgement_can_be_taken_back(auth_client, supervisor, alert):
    client = auth_client(supervisor)
    ack(client, alert)
    response = unack(client, alert)
    assert response.status_code == 200
    assert response.json()['data']['acknowledgedBy'] is None and response.json()['data']['acknowledgedAt'] is None


def test_taking_back_what_was_never_acknowledged_is_fine(auth_client, supervisor, alert):
    assert unack(auth_client(supervisor), alert).status_code == 200


def test_the_owner_cannot_take_an_acknowledgement_back(auth_client, owner, supervisor, alert):
    ack(auth_client(supervisor), alert)
    assert unack(auth_client(owner), alert).status_code == 403
    alert.refresh_from_db()
    assert alert.acknowledged_by_id == supervisor.pk


def test_everyone_who_sees_the_alert_sees_who_acknowledged_it(auth_client, owner, supervisor, alert):
    ack(auth_client(supervisor), alert)
    listed = auth_client(owner).get('/api/alerts?unread=false').json()['data']
    assert listed[0]['acknowledgedBy']['name'] == 'Claire Mukamana'


def test_an_alert_nobody_acknowledged_says_so_with_nulls(auth_client, owner, alert):
    listed = auth_client(owner).get('/api/alerts?unread=false').json()['data']
    assert listed[0]['acknowledgedBy'] is None and listed[0]['acknowledgedAt'] is None


def test_a_supervisor_of_another_cooperative_cannot_acknowledge(auth_client, alert):
    stranger = UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())
    assert ack(auth_client(stranger), alert).status_code == 404


def test_acknowledging_is_written_to_the_audit_log(auth_client, supervisor, alert):
    ack(auth_client(supervisor), alert)
    entry = AuditLog.objects.get(resource='Alert', action='UPDATE')
    assert entry.resource_id == alert.pk and 'cknowledged' in entry.detail


def test_a_room_alert_can_be_acknowledged_too(auth_client, supervisor, farm):
    room = RearingRoom.objects.create(farm=farm, name='Rearing house 1')
    air = AlertLogFactory(batch=None, room=room, type='TEMPERATURE', message='Too hot')
    assert ack(auth_client(supervisor), air).status_code == 200


# ── writing comments ────────────────────────────────────────────────────────

def test_a_supervisor_comments_and_the_comment_comes_back_with_its_author(auth_client, supervisor, alert):
    response = comment(auth_client(supervisor), alert, 'Please open the windows.')
    assert response.status_code == 201
    data = response.json()['data']
    assert data['body'] == 'Please open the windows.'
    assert data['author'] == {'id': supervisor.pk, 'name': 'Claire Mukamana'}
    assert data['createdAt'] and data['canDelete'] is True


def test_the_owner_may_answer(auth_client, owner, supervisor, alert):
    comment(auth_client(supervisor), alert)
    assert comment(auth_client(owner), alert, 'Done, thank you.').status_code == 201


def test_an_admin_may_comment(auth_client, admin, alert):
    assert comment(auth_client(admin), alert).status_code == 201


def test_a_stranger_cannot_comment(auth_client, alert):
    stranger = UserFactory(role='FARMER', cooperative=CooperativeFactory())
    assert comment(auth_client(stranger), alert).status_code == 404
    assert AlertComment.objects.count() == 0


def test_a_supervisor_of_another_cooperative_cannot_comment(auth_client, alert):
    stranger = UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory())
    assert comment(auth_client(stranger), alert).status_code == 404


def test_the_text_is_trimmed(auth_client, supervisor, alert):
    assert comment(auth_client(supervisor), alert, '  Hello there  \n').json()['data']['body'] == 'Hello there'


@pytest.mark.parametrize('body', ['', '   ', '\n\t'])
def test_an_empty_comment_is_refused_kindly(auth_client, supervisor, alert, body):
    response = comment(auth_client(supervisor), alert, body)
    assert response.status_code == 422
    assert response.json()['errors']['body'] == ['Please write a comment.']
    assert AlertComment.objects.count() == 0


def test_a_missing_body_is_refused(auth_client, supervisor, alert):
    assert auth_client(supervisor).post(f'/api/alerts/{alert.pk}/comments', {}, format='json').status_code == 422


def test_a_comment_may_be_a_thousand_characters_and_no_more(auth_client, supervisor, alert):
    client = auth_client(supervisor)
    assert comment(client, alert, 'a' * 1000).status_code == 201
    over = comment(client, alert, 'a' * 1001)
    assert over.status_code == 422
    assert over.json()['errors']['body'] == ['A comment can be up to 1,000 characters.']


def test_line_breaks_are_kept(auth_client, supervisor, alert):
    assert comment(auth_client(supervisor), alert, 'First.\nSecond.').json()['data']['body'] == 'First.\nSecond.'


def test_markup_is_stored_as_the_person_wrote_it(auth_client, supervisor, alert):
    body = '<b>Hi</b> & <script>x</script>'
    assert comment(auth_client(supervisor), alert, body).json()['data']['body'] == body


def test_commenting_is_written_to_the_audit_log(auth_client, supervisor, alert):
    made = comment(auth_client(supervisor), alert).json()['data']
    entry = AuditLog.objects.get(resource='AlertComment', action='CREATE')
    assert entry.resource_id == made['id'] and alert.pk in entry.detail


def test_the_text_of_a_comment_is_not_copied_into_the_audit_log(auth_client, supervisor, alert):
    comment(auth_client(supervisor), alert, 'A private word of advice.')
    assert 'private word' not in AuditLog.objects.get(resource='AlertComment').detail


# ── reading comments ────────────────────────────────────────────────────────

def test_the_thread_is_oldest_first(auth_client, owner, supervisor, alert):
    comment(auth_client(supervisor), alert, 'one')
    comment(auth_client(owner), alert, 'two')
    comment(auth_client(supervisor), alert, 'three')
    assert [c['body'] for c in comments(auth_client(owner), alert).json()['data']] == ['one', 'two', 'three']


def test_everyone_who_sees_the_alert_reads_the_thread(auth_client, owner, supervisor, admin, alert):
    comment(auth_client(supervisor), alert, 'one')
    for person in (owner, supervisor, admin):
        assert len(comments(auth_client(person), alert).json()['data']) == 1


def test_a_stranger_cannot_read_the_thread(auth_client, supervisor, alert):
    comment(auth_client(supervisor), alert)
    stranger = UserFactory(role='FARMER', cooperative=CooperativeFactory())
    assert comments(auth_client(stranger), alert).status_code == 404


def test_the_thread_never_names_a_role(auth_client, owner, admin, alert):
    comment(auth_client(admin), alert)
    body = comments(auth_client(owner), alert).content.decode().lower()
    assert 'administrator' not in body and '"role"' not in body


def test_a_deleted_comment_is_gone_from_the_thread(auth_client, supervisor, alert):
    client = auth_client(supervisor)
    gone = comment(client, alert, 'gone').json()['data']
    comment(client, alert, 'stays')
    client.delete(f'/api/alerts/{alert.pk}/comments/{gone["id"]}')
    assert [c['body'] for c in comments(client, alert).json()['data']] == ['stays']


def test_the_alert_list_counts_its_comments(auth_client, owner, supervisor, alert):
    comment(auth_client(supervisor), alert)
    comment(auth_client(owner), alert)
    gone = comment(auth_client(supervisor), alert).json()['data']
    auth_client(supervisor).delete(f'/api/alerts/{alert.pk}/comments/{gone["id"]}')
    assert auth_client(owner).get('/api/alerts?unread=false').json()['data'][0]['commentCount'] == 2


def test_the_batch_alerts_carry_the_counts_too(auth_client, owner, supervisor, alert):
    comment(auth_client(supervisor), alert)
    rows = auth_client(owner).get(f'/api/alerts/batch/{alert.batch_id}').json()['data']
    assert rows[0]['commentCount'] == 1


# ── deleting comments ───────────────────────────────────────────────────────

def test_the_author_deletes_their_own_comment_and_the_row_is_kept(auth_client, supervisor, alert):
    client = auth_client(supervisor)
    made = comment(client, alert).json()['data']
    response = client.delete(f'/api/alerts/{alert.pk}/comments/{made["id"]}')
    assert response.status_code == 200
    row = AlertComment.objects.get(pk=made['id'])
    assert row.is_active is False


def test_someone_else_cannot_delete_a_comment(auth_client, owner, supervisor, alert):
    made = comment(auth_client(supervisor), alert).json()['data']
    response = auth_client(owner).delete(f'/api/alerts/{alert.pk}/comments/{made["id"]}')
    assert response.status_code == 403
    assert response.json()['message'] == 'You can only delete your own comments.'
    assert AlertComment.objects.get(pk=made['id']).is_active is True


def test_an_admin_may_delete_any_comment(auth_client, owner, admin, alert):
    made = comment(auth_client(owner), alert).json()['data']
    assert auth_client(admin).delete(f'/api/alerts/{alert.pk}/comments/{made["id"]}').status_code == 200


def test_can_delete_is_true_only_for_the_author_and_an_admin(auth_client, owner, supervisor, admin, alert):
    comment(auth_client(supervisor), alert)
    flags = {name: comments(auth_client(person), alert).json()['data'][0]['canDelete'] for name, person in (('owner', owner), ('supervisor', supervisor), ('admin', admin))}
    assert flags == {'owner': False, 'supervisor': True, 'admin': True}


def test_deleting_twice_says_not_found(auth_client, supervisor, alert):
    client = auth_client(supervisor)
    made = comment(client, alert).json()['data']
    client.delete(f'/api/alerts/{alert.pk}/comments/{made["id"]}')
    assert client.delete(f'/api/alerts/{alert.pk}/comments/{made["id"]}').status_code == 404


def test_a_comment_of_another_alert_cannot_be_deleted_through_this_one(auth_client, supervisor, farm, alert):
    other = AlertLogFactory(batch=BatchFactory(farm=farm), type='DISEASE', message='x')
    made = comment(auth_client(supervisor), other).json()['data']
    assert auth_client(supervisor).delete(f'/api/alerts/{alert.pk}/comments/{made["id"]}').status_code == 404


def test_deleting_is_written_to_the_audit_log(auth_client, supervisor, alert):
    client = auth_client(supervisor)
    made = comment(client, alert).json()['data']
    client.delete(f'/api/alerts/{alert.pk}/comments/{made["id"]}')
    assert AuditLog.objects.filter(resource='AlertComment', action='DELETE', resource_id=made['id']).exists()


# ── telling the owner ───────────────────────────────────────────────────────

def test_a_supervisors_comment_is_emailed_to_the_owner(auth_client, supervisor, alert):
    comment(auth_client(supervisor), alert, 'Please open the windows.')
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == ['serge@example.rw']
    assert 'Serge Farm' in message.subject
    assert 'Claire Mukamana' in message.body and 'Please open the windows.' in message.body
    assert 'Pebrine suspected in this batch' in message.body
    assert '/alerts' in message.body


def test_an_admins_comment_is_emailed_without_naming_a_role(auth_client, admin, alert):
    comment(auth_client(admin), alert)
    assert 'administrator' not in mail.outbox[0].body.lower()
    assert 'Aline Uwase' in mail.outbox[0].body


def test_the_email_has_the_shared_look_and_says_why_it_came(auth_client, supervisor, alert):
    comment(auth_client(supervisor), alert)
    message = mail.outbox[0]
    assert message.alternatives and message.alternatives[0][1] == 'text/html'
    assert 'You received this because you own Serge Farm on SSMS.' in message.body


def test_the_owners_own_comment_sends_no_email(auth_client, owner, alert):
    comment(auth_client(owner), alert)
    assert mail.outbox == []


def test_markup_in_the_comment_is_escaped_in_the_html_of_the_email(auth_client, supervisor, alert):
    comment(auth_client(supervisor), alert, '<script>alert(1)</script>')
    html = mail.outbox[0].alternatives[0][0]
    assert '<script>alert(1)</script>' not in html


def test_a_room_alert_comment_goes_to_the_owner_of_the_farm(auth_client, supervisor, farm):
    room = RearingRoom.objects.create(farm=farm, name='Rearing house 1')
    air = AlertLogFactory(batch=None, room=room, type='TEMPERATURE', message='Too hot')
    comment(auth_client(supervisor), air)
    assert mail.outbox[0].to == ['serge@example.rw']


def test_a_failed_email_does_not_lose_the_comment(auth_client, supervisor, alert):
    with mock.patch('alerts.comment_views.send_email_async', side_effect=OSError('smtp down')):
        response = comment(auth_client(supervisor), alert)
    assert response.status_code == 201
    assert AlertComment.objects.count() == 1


def test_an_owner_without_an_email_is_simply_not_emailed(auth_client, supervisor, alert, owner):
    owner.email = ''
    owner.save(update_fields=['email'])
    assert comment(auth_client(supervisor), alert).status_code == 201
    assert mail.outbox == []


# ── cost ────────────────────────────────────────────────────────────────────

def test_the_alert_list_costs_the_same_however_many_comments_there_are(auth_client, owner, supervisor, farm):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    def cost():
        with CaptureQueriesContext(connection) as queries:
            assert auth_client(owner).get('/api/alerts?unread=false').status_code == 200
        return len(queries)

    first = AlertLogFactory(batch=BatchFactory(farm=farm), type='DISEASE', message='x')
    comment(auth_client(supervisor), first)
    few = cost()
    for _ in range(6):
        extra = AlertLogFactory(batch=BatchFactory(farm=farm), type='DISEASE', message='y')
        comment(auth_client(supervisor), extra)
        comment(auth_client(supervisor), extra)
    assert cost() == few
    assert AlertLog.objects.count() == 7
