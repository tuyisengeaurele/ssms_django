"""While an admin acts as a person, every record names the real admin, and every request is kept.

The person's own sign in is unchanged: their actions are still theirs.
"""
import pytest
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from logs.models import RequestLog, SecurityEvent
from tests.factories import FarmFactory
from tests.support_helpers import acting, admin_and_person
from tests.test_one_auth_query import sign_in

pytestmark = pytest.mark.django_db


def client_for(token):
    client = APIClient(raise_request_exception=False)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


def farm_entries():
    return AuditLog.objects.filter(resource='Farm')


def test_a_change_made_while_acting_is_the_admins_in_the_audit_log_on_behalf_of_the_person():
    admin, person = admin_and_person()
    farm = FarmFactory(owner=person)
    token, access = acting(admin, person, mode='edit')
    assert client_for(token).patch(f'/api/farms/{farm.pk}', {'name': 'Renamed'}, format='json').status_code == 200

    entry = farm_entries().get()
    assert entry.user_id == admin.pk and entry.user_email == admin.email
    assert entry.on_behalf_of_email == person.email
    assert 'support access' in entry.detail and access.pk in entry.detail


def test_the_persons_own_change_is_still_the_persons():
    farm = FarmFactory()
    person = farm.owner
    token, _ = sign_in(person)
    assert client_for(token).patch(f'/api/farms/{farm.pk}', {'name': 'Renamed'}, format='json').status_code == 200
    entry = farm_entries().get()
    assert entry.user_id == person.pk and entry.on_behalf_of_email == '' and 'support access' not in entry.detail


def test_a_role_refusal_while_acting_is_recorded_against_the_admin_and_says_who_it_was_as():
    admin, person = admin_and_person()
    token, _ = acting(admin, person)
    # A farmer may not list a team. The rules allow the read, and the role check refuses it.
    assert client_for(token).get('/api/team/farmers').status_code == 403
    event = SecurityEvent.objects.get(kind='permission_denied')
    assert event.user_id == admin.pk and event.detail.startswith(f'as {person.email}: ')


def test_a_role_refusal_of_the_person_themselves_is_the_persons():
    person = FarmFactory().owner
    token, _ = sign_in(person)
    assert client_for(token).get('/api/team/farmers').status_code == 403
    event = SecurityEvent.objects.get(kind='permission_denied')
    assert event.user_id == person.pk and not event.detail.startswith('as ')


def test_every_request_of_a_visit_is_kept_even_when_the_log_keeps_none_of_the_good_ones(settings):
    settings.REQUEST_LOG_SAMPLE_RATE = 0
    admin, person = admin_and_person()
    token, access = acting(admin, person)
    RequestLog.objects.all().delete()

    for _ in range(3):
        assert client_for(token).get('/api/farms').status_code == 200
    kept = RequestLog.objects.filter(support_access_id=access.pk)
    assert kept.count() == 3
    assert {(r.user_id, r.role) for r in kept} == {(person.pk, 'FARMER')}


def test_an_ordinary_good_request_is_still_sampled(settings):
    settings.REQUEST_LOG_SAMPLE_RATE = 0
    person = FarmFactory().owner
    token, _ = sign_in(person)
    RequestLog.objects.all().delete()
    assert client_for(token).get('/api/farms').status_code == 200
    assert RequestLog.objects.count() == 0


def test_a_failed_request_of_an_ordinary_person_has_no_support_id():
    person = FarmFactory().owner
    token, _ = sign_in(person)
    RequestLog.objects.all().delete()
    client_for(token).get('/api/nothing-here')
    assert RequestLog.objects.get().support_access_id == ''


def test_no_log_holds_the_token():
    admin, person = admin_and_person()
    farm = FarmFactory(owner=person)
    token, _ = acting(admin, person, mode='edit')
    client = client_for(token)
    client.patch(f'/api/farms/{farm.pk}', {'name': 'Renamed'}, format='json')
    client.delete(f'/api/farms/{farm.pk}')
    everything = ' '.join(
        [*AuditLog.objects.values_list('detail', flat=True), *SecurityEvent.objects.values_list('detail', flat=True),
         *RequestLog.objects.values_list('route', flat=True)],
    )
    assert token not in everything and 'Bearer' not in everything
