import re
from unittest import mock

import pytest
from django.core import mail

from audit_log.models import AuditLog
from tests.factories import CooperativeFactory, UserFactory
from users.models import User

pytestmark = pytest.mark.django_db

URL = '/api/admin/users'
STRONG = 'Zebra-Quartz-84'


@pytest.fixture
def admin_client(auth_client):
    return auth_client(UserFactory(role='ADMIN'))


def create(client, **body):
    payload = {'name': 'Aline Uwase', 'email': 'aline@example.rw', **body}
    return client.post(URL, payload, format='json')


def test_the_admin_can_create_a_supervisor_and_the_role_is_kept(admin_client):
    response = create(admin_client, role='SUPERVISOR', password=STRONG)
    assert response.status_code == 201
    user = User.objects.get(email='aline@example.rw')
    assert user.role == 'SUPERVISOR'
    assert response.json()['data']['role'] == 'SUPERVISOR'


def test_the_new_user_can_sign_in_straight_away(admin_client, api_client):
    create(admin_client, role='FARMER', password=STRONG)
    user = User.objects.get(email='aline@example.rw')
    assert user.is_email_verified is True
    login = api_client.post('/api/auth/login', {'email': 'aline@example.rw', 'password': STRONG}, format='json')
    assert login.status_code == 200


def test_creating_a_user_is_audited(admin_client):
    create(admin_client, role='FARMER', password=STRONG)
    entry = AuditLog.objects.get(action='CREATE', resource='User')
    assert 'aline@example.rw' in entry.detail


def test_without_a_password_the_user_gets_an_invitation_to_choose_one(admin_client, api_client):
    response = create(admin_client, role='SUPERVISOR')
    assert response.status_code == 201
    user = User.objects.get(email='aline@example.rw')
    assert not user.has_usable_password()
    assert user.is_email_verified is True

    assert len(mail.outbox) == 1
    invitation = mail.outbox[0]
    assert invitation.to == ['aline@example.rw']
    uid, token = re.search(r'/reset-password\?uid=([^&\s]+)&token=([^\s]+)', invitation.body).groups()

    chosen = api_client.post('/api/auth/password-reset/confirm', {'uid': uid, 'token': token, 'newPassword': STRONG}, format='json')
    assert chosen.status_code == 200
    login = api_client.post('/api/auth/login', {'email': 'aline@example.rw', 'password': STRONG}, format='json')
    assert login.status_code == 200


def test_a_given_password_sends_no_invitation(admin_client):
    create(admin_client, role='FARMER', password=STRONG)
    assert mail.outbox == []


def test_a_failed_invitation_still_creates_the_user(admin_client):
    with mock.patch('users.admin_views.send_mail', side_effect=OSError('smtp down')):
        response = create(admin_client, role='FARMER')
    assert response.status_code == 201
    assert User.objects.filter(email='aline@example.rw').exists()
    assert 'could not be sent' in response.json()['message']


def test_a_weak_password_is_refused_in_plain_words(admin_client):
    response = create(admin_client, role='FARMER', password='Password1')
    assert response.status_code == 422
    assert 'too common' in str(response.json()['errors']['password'])
    assert not User.objects.filter(email='aline@example.rw').exists()


def test_a_duplicate_email_is_refused(admin_client):
    UserFactory(email='aline@example.rw')
    assert create(admin_client, role='FARMER', password=STRONG).status_code == 422


def test_an_unknown_role_is_refused(admin_client):
    assert create(admin_client, role='KING', password=STRONG).status_code == 422


def test_the_role_defaults_to_farmer(admin_client):
    create(admin_client, password=STRONG)
    assert User.objects.get(email='aline@example.rw').role == 'FARMER'


def test_a_cooperative_can_be_assigned(admin_client):
    coop = CooperativeFactory()
    response = create(admin_client, role='SUPERVISOR', password=STRONG, cooperativeId=coop.pk)
    assert response.status_code == 201
    assert User.objects.get(email='aline@example.rw').cooperative_id == coop.pk


def test_an_unknown_or_closed_cooperative_is_refused(admin_client):
    closed = CooperativeFactory(is_active=False)
    assert create(admin_client, role='FARMER', password=STRONG, cooperativeId='nope').status_code == 422
    assert create(admin_client, role='FARMER', password=STRONG, cooperativeId=closed.pk).status_code == 422


def test_an_administrator_cannot_be_given_a_cooperative(admin_client):
    coop = CooperativeFactory()
    assert create(admin_client, role='ADMIN', password=STRONG, cooperativeId=coop.pk).status_code == 422


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_administrators_may_create_users(auth_client, role):
    response = create(auth_client(UserFactory(role=role)), role='ADMIN', password=STRONG)
    assert response.status_code == 403
    assert not User.objects.filter(email='aline@example.rw').exists()


def test_signing_in_is_required(api_client):
    assert create(api_client, role='FARMER', password=STRONG).status_code == 401
