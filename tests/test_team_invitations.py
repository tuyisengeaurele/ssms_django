"""Supervisors invite farmers with a link, see their farmers, and can remove one from the cooperative."""
import re
from datetime import timedelta
from unittest import mock

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from cooperatives.models import CooperativeInvitation
from tests.factories import CooperativeFactory, FarmFactory, UserFactory
from users.models import User

pytestmark = pytest.mark.django_db

STRONG = 'Zebra-Quartz-84'
INVITATIONS = '/api/team/invitations'
FARMERS = '/api/team/farmers'
NO_LONGER_VALID = 'This invitation is no longer valid.'


@pytest.fixture
def coop():
    return CooperativeFactory(name='Gatsibo Silk')


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')


@pytest.fixture
def sup_client(auth_client, supervisor):
    return auth_client(supervisor)


def invite(client, **body):
    return client.post(INVITATIONS, body, format='json')


def token_of(response):
    return response.json()['data']['link'].rsplit('/', 1)[1]


def join_details(token):
    return APIClient().get(f'/api/invitations/{token}')


def register(token, **extra):
    body = {'name': 'Aline Uwase', 'email': 'aline@example.rw', 'password': STRONG, 'invitation': token, **extra}
    return APIClient().post('/api/auth/register', body, format='json')


# ── making an invitation ────────────────────────────────────────────────────

def test_a_supervisor_gets_a_link_to_share(sup_client, coop):
    response = invite(sup_client)
    assert response.status_code == 201
    data = response.json()['data']
    assert re.fullmatch(r'http://localhost:5173/join/[A-Za-z0-9_-]{40,}', data['link'])
    assert data['status'] == 'pending'
    assert data['email'] == ''
    assert CooperativeInvitation.objects.get().cooperative_id == coop.pk


def test_only_a_hash_of_the_token_is_stored(sup_client):
    token = token_of(invite(sup_client))
    row = CooperativeInvitation.objects.get()
    assert token not in row.token_hash
    assert len(row.token_hash) == 64


def test_the_link_is_shown_once_and_never_in_the_list(sup_client):
    token = token_of(invite(sup_client))
    assert token not in sup_client.get(INVITATIONS).content.decode()


def test_an_invitation_lasts_a_week(sup_client):
    invite(sup_client)
    left = CooperativeInvitation.objects.get().expires_at - timezone.now()
    assert timedelta(days=6, hours=23) < left <= timedelta(days=7)


def test_naming_an_email_also_sends_the_link_to_it(sup_client):
    response = invite(sup_client, email='Aline@Example.rw')
    assert response.status_code == 201
    assert CooperativeInvitation.objects.get().email == 'aline@example.rw'
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ['aline@example.rw']
    assert token_of(response) in mail.outbox[0].body
    assert 'Gatsibo Silk' in mail.outbox[0].body


def test_a_failed_email_still_makes_the_link(sup_client):
    with mock.patch('cooperatives.invitations.send_email', side_effect=OSError('smtp down')):
        response = invite(sup_client, email='aline@example.rw')
    assert response.status_code == 201
    assert 'could not be sent' in response.json()['message']
    assert CooperativeInvitation.objects.count() == 1


def test_a_bad_email_is_refused(sup_client):
    assert invite(sup_client, email='not-an-email').status_code == 422
    assert CooperativeInvitation.objects.count() == 0


def test_creating_one_is_audited(sup_client):
    invite(sup_client)
    assert AuditLog.objects.filter(action='CREATE', resource='Invitation').exists()


def test_a_farmer_cannot_invite(auth_client, coop):
    assert invite(auth_client(UserFactory(role='FARMER', cooperative=coop))).status_code == 403


def test_a_supervisor_without_a_cooperative_cannot_invite(auth_client):
    response = invite(auth_client(UserFactory(role='SUPERVISOR')))
    assert response.status_code == 403
    assert response.json()['message'] == 'You are not part of a cooperative yet.'


def test_an_admin_names_the_cooperative(auth_client, coop):
    admin = auth_client(UserFactory(role='ADMIN'))
    assert invite(admin).status_code == 422
    assert invite(admin, cooperativeId=coop.pk).status_code == 201
    assert invite(admin, cooperativeId='nope').status_code == 404


def test_signing_in_is_required(api_client):
    assert invite(api_client).status_code == 401
    assert api_client.get(INVITATIONS).status_code == 401


# ── listing and revoking ────────────────────────────────────────────────────

def test_the_list_shows_my_cooperatives_invitations_with_their_state(sup_client, coop):
    invite(sup_client, email='one@example.rw')
    other = CooperativeFactory()
    other_sup = UserFactory(role='SUPERVISOR', cooperative=other)
    CooperativeInvitation.objects.create(cooperative=other, invited_by=other_sup, token_hash='x' * 64, expires_at=timezone.now() + timedelta(days=1))
    rows = sup_client.get(INVITATIONS).json()['data']
    assert [(r['email'], r['status'], r['invitedByName']) for r in rows] == [('one@example.rw', 'pending', 'Claire Uwimana')]


def test_states_follow_from_the_dates(sup_client, coop, supervisor):
    now = timezone.now()
    day = timedelta(days=1)

    def make(number, **kw):
        return CooperativeInvitation.objects.create(
            cooperative=coop, invited_by=supervisor, token_hash=f'{number}'.ljust(64, 'x'), **kw,
        )

    make(1, expires_at=now + day)
    make(2, expires_at=now - day)
    make(3, expires_at=now + day, revoked_at=now)
    make(4, expires_at=now + day, accepted_at=now, accepted_by=UserFactory())
    states = sorted(r['status'] for r in sup_client.get(INVITATIONS).json()['data'])
    assert states == ['accepted', 'expired', 'pending', 'revoked']


def test_a_supervisor_revokes_a_pending_invitation_and_the_link_stops_working(sup_client):
    token = token_of(invite(sup_client))
    row = CooperativeInvitation.objects.get()
    assert sup_client.delete(f'{INVITATIONS}/{row.pk}').status_code == 200
    assert join_details(token).status_code == 404
    assert sup_client.get(INVITATIONS).json()['data'][0]['status'] == 'revoked'


def test_another_cooperative_cannot_revoke_it(auth_client, sup_client):
    invite(sup_client)
    row = CooperativeInvitation.objects.get()
    stranger = auth_client(UserFactory(role='SUPERVISOR', cooperative=CooperativeFactory()))
    assert stranger.delete(f'{INVITATIONS}/{row.pk}').status_code == 404
    assert CooperativeInvitation.objects.get().revoked_at is None


# ── what the person with the link sees ─────────────────────────────────────

def test_the_link_page_names_the_cooperative_and_who_invited(sup_client):
    token = token_of(invite(sup_client))
    data = join_details(token).json()['data']
    assert data == {'cooperativeName': 'Gatsibo Silk', 'invitedByName': 'Claire Uwimana', 'email': ''}


def test_an_email_bound_invitation_tells_the_page_which_address(sup_client):
    token = token_of(invite(sup_client, email='aline@example.rw'))
    assert join_details(token).json()['data']['email'] == 'aline@example.rw'


@pytest.mark.parametrize('how', ['unknown', 'expired', 'revoked', 'used'])
def test_a_link_that_cannot_be_used_always_gets_the_same_answer(sup_client, how):
    token = 'unknown-token' if how == 'unknown' else token_of(invite(sup_client))
    if how == 'expired':
        CooperativeInvitation.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
    if how == 'revoked':
        CooperativeInvitation.objects.update(revoked_at=timezone.now())
    if how == 'used':
        CooperativeInvitation.objects.update(accepted_at=timezone.now(), accepted_by=UserFactory())
    response = join_details(token)
    assert response.status_code == 404
    assert response.json()['message'] == NO_LONGER_VALID


def test_the_link_page_does_not_need_a_sign_in_and_ignores_a_stale_token(sup_client):
    token = token_of(invite(sup_client))
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION='Bearer garbage')
    assert client.get(f'/api/invitations/{token}').status_code == 200


# ── joining by registering through the link ────────────────────────────────

def test_registering_through_the_link_makes_a_farmer_in_the_cooperative(sup_client, coop):
    token = token_of(invite(sup_client))
    response = register(token)
    assert response.status_code == 201
    user = User.objects.get(email='aline@example.rw')
    assert (user.role, user.cooperative_id) == ('FARMER', coop.pk)
    row = CooperativeInvitation.objects.get()
    assert (row.accepted_by_id, row.accepted_at is not None) == (user.pk, True)


def test_a_link_without_an_email_still_needs_the_address_to_be_verified(sup_client):
    register(token_of(invite(sup_client)))
    assert User.objects.get(email='aline@example.rw').is_email_verified is False
    assert len(mail.outbox) == 1


def test_a_link_sent_to_that_email_counts_as_proof_of_the_address(sup_client):
    token = token_of(invite(sup_client, email='aline@example.rw'))
    mail.outbox.clear()
    response = register(token)
    assert response.status_code == 201
    assert User.objects.get(email='aline@example.rw').is_email_verified is True
    assert mail.outbox == []
    assert response.json()['data']['user']['isEmailVerified'] is True


def test_an_email_bound_link_cannot_be_used_with_another_address(sup_client):
    token = token_of(invite(sup_client, email='aline@example.rw'))
    response = register(token, email='someone.else@example.rw')
    assert response.status_code == 422
    assert not User.objects.filter(email='someone.else@example.rw').exists()
    assert CooperativeInvitation.objects.get().accepted_at is None


def test_a_link_works_only_once(sup_client):
    token = token_of(invite(sup_client))
    assert register(token).status_code == 201
    second = register(token, email='second@example.rw')
    assert second.status_code == 422
    assert not User.objects.filter(email='second@example.rw').exists()


def test_a_bad_link_stops_the_registration_and_creates_nothing():
    response = register('made-up-token')
    assert response.status_code == 422
    assert not User.objects.filter(email='aline@example.rw').exists()


def test_registering_without_a_link_still_works_as_before():
    response = APIClient().post('/api/auth/register', {'name': 'Plain Person', 'email': 'plain@example.rw', 'password': STRONG}, format='json')
    assert response.status_code == 201
    assert User.objects.get(email='plain@example.rw').cooperative_id is None


# ── joining when already registered ────────────────────────────────────────

def accept(client, token):
    return client.post(f'/api/invitations/{token}/accept', {}, format='json')


def test_a_signed_in_farmer_accepts_and_joins(auth_client, sup_client, coop):
    token = token_of(invite(sup_client))
    farmer = UserFactory(role='FARMER')
    response = accept(auth_client(farmer), token)
    assert response.status_code == 200
    farmer.refresh_from_db()
    assert farmer.cooperative_id == coop.pk
    assert CooperativeInvitation.objects.get().accepted_by_id == farmer.pk


def test_accepting_moves_a_farmer_from_another_cooperative(auth_client, sup_client, coop):
    token = token_of(invite(sup_client))
    farmer = UserFactory(role='FARMER', cooperative=CooperativeFactory())
    accept(auth_client(farmer), token)
    farmer.refresh_from_db()
    assert farmer.cooperative_id == coop.pk
    assert AuditLog.objects.filter(resource='User', detail__contains='joined').exists()


def test_a_farmer_already_in_the_cooperative_keeps_the_invitation_unused(auth_client, sup_client, coop):
    token = token_of(invite(sup_client))
    response = accept(auth_client(UserFactory(role='FARMER', cooperative=coop)), token)
    assert response.status_code == 200
    assert CooperativeInvitation.objects.get().accepted_at is None


def test_only_farmers_can_accept(auth_client, sup_client):
    token = token_of(invite(sup_client))
    assert accept(auth_client(UserFactory(role='SUPERVISOR')), token).status_code == 403
    assert accept(auth_client(UserFactory(role='ADMIN')), token).status_code == 403
    assert CooperativeInvitation.objects.get().accepted_at is None


def test_an_email_bound_link_cannot_be_accepted_by_another_account(auth_client, sup_client):
    token = token_of(invite(sup_client, email='aline@example.rw'))
    response = accept(auth_client(UserFactory(role='FARMER', email='other@example.rw')), token)
    assert response.status_code == 403
    assert response.json()['message'] == 'This invitation was sent to a different email address.'


def test_accepting_needs_a_sign_in_and_a_valid_link(api_client, auth_client, sup_client):
    token = token_of(invite(sup_client))
    assert accept(api_client, token).status_code == 401
    assert accept(auth_client(UserFactory(role='FARMER')), 'nope').status_code == 404


# ── the team ────────────────────────────────────────────────────────────────

def test_a_supervisor_sees_the_farmers_of_the_cooperative_with_their_farms(sup_client, coop):
    mine = UserFactory(role='FARMER', cooperative=coop, name='Bruce Ishimwe')
    FarmFactory(owner=mine)
    FarmFactory(owner=mine)
    UserFactory(role='FARMER', cooperative=CooperativeFactory(), name='Not Mine')
    UserFactory(role='SUPERVISOR', cooperative=coop, name='Another Supervisor')
    UserFactory(role='FARMER', cooperative=coop, name='Switched Off', is_active=False)
    rows = sup_client.get(FARMERS).json()['data']
    assert [(r['name'], r['farmCount']) for r in rows] == [('Bruce Ishimwe', 2)]
    assert set(rows[0]) >= {'id', 'name', 'email', 'joinedAt', 'farmCount'}


def test_deleted_farms_are_not_counted(sup_client, coop):
    farmer = UserFactory(role='FARMER', cooperative=coop)
    FarmFactory(owner=farmer)
    FarmFactory(owner=farmer, is_active=False)
    assert sup_client.get(FARMERS).json()['data'][0]['farmCount'] == 1


def test_removing_a_farmer_takes_them_out_of_the_cooperative_and_nothing_else(sup_client, coop):
    farmer = UserFactory(role='FARMER', cooperative=coop)
    farm = FarmFactory(owner=farmer)
    response = sup_client.delete(f'{FARMERS}/{farmer.pk}')
    assert response.status_code == 200
    assert response.json()['message'] == 'Farmer removed from the cooperative.'
    farmer.refresh_from_db()
    farm.refresh_from_db()
    assert farmer.cooperative_id is None
    assert (farmer.is_active, farm.is_active) == (True, True)
    assert sup_client.get(FARMERS).json()['data'] == []
    assert AuditLog.objects.filter(action='UPDATE', resource='User', detail__contains='Removed').exists()


def test_a_removed_farmer_no_longer_shows_their_farm_to_the_supervisor(auth_client, sup_client, coop):
    farmer = UserFactory(role='FARMER', cooperative=coop)
    farm = FarmFactory(owner=farmer)
    assert sup_client.get(f'/api/farms/{farm.pk}').status_code == 200
    sup_client.delete(f'{FARMERS}/{farmer.pk}')
    assert sup_client.get(f'/api/farms/{farm.pk}').status_code == 404


def test_a_supervisor_cannot_remove_someone_from_another_cooperative(sup_client):
    stranger = UserFactory(role='FARMER', cooperative=CooperativeFactory())
    assert sup_client.delete(f'{FARMERS}/{stranger.pk}').status_code == 404
    stranger.refresh_from_db()
    assert stranger.cooperative_id is not None


def test_only_farmers_can_be_removed_this_way(sup_client, coop):
    other_supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    assert sup_client.delete(f'{FARMERS}/{other_supervisor.pk}').status_code == 404
    other_supervisor.refresh_from_db()
    assert other_supervisor.cooperative_id == coop.pk


def test_farmers_cannot_see_or_change_the_team(auth_client, coop):
    farmer = UserFactory(role='FARMER', cooperative=coop)
    other = UserFactory(role='FARMER', cooperative=coop)
    client = auth_client(farmer)
    assert client.get(FARMERS).status_code == 403
    assert client.delete(f'{FARMERS}/{other.pk}').status_code == 403


def test_an_admin_names_the_cooperative_to_see_its_team(auth_client, coop):
    UserFactory(role='FARMER', cooperative=coop, name='Bruce Ishimwe')
    admin = auth_client(UserFactory(role='ADMIN'))
    assert admin.get(FARMERS).status_code == 422
    assert [r['name'] for r in admin.get(f'{FARMERS}?cooperativeId={coop.pk}').json()['data']] == ['Bruce Ishimwe']
