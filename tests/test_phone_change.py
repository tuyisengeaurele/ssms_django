"""Changing a phone number needs the current number typed, like deleting a repository needs its name.

The server checks it, so a client that skips the dialog is refused too. A number cannot be emptied by the person who holds
it. The SSMS team can clear or reassign one, and the person then meets the gate.
"""
import pytest

from core.doc_text import t
from logs.models import SecurityEvent
from tests.factories import UserFactory
from users.models import User

pytestmark = pytest.mark.django_db

ME = '/api/auth/me'
CURRENT = '+250788123456'


def edit(person, auth_client, **body):
    return auth_client(person).patch(ME, body, format='json')


@pytest.fixture
def person():
    return UserFactory(phone=CURRENT)


def number_of(person):
    person.refresh_from_db()
    return person.phone


# ── the person ───────────────────────────────────────────────────────────────────────────────

def test_adding_a_first_number_needs_no_confirmation(auth_client):
    nobody = UserFactory(phone=None)
    assert edit(nobody, auth_client, phone='0733 000 000').status_code == 200
    assert number_of(nobody) == '+250733000000'


def test_changing_the_number_without_confirm_phone_is_refused(person, auth_client):
    response = edit(person, auth_client, phone='0733 000 000')
    assert response.status_code == 422
    assert response.json()['code'] == 'phone_confirm_mismatch'
    assert response.json()['errors']['confirmPhone'][0] == t('en', 'erPhoneConfirm')
    assert number_of(person) == CURRENT


def test_the_refusal_is_written_in_the_language_asked_for(person, auth_client):
    response = auth_client(person).patch(ME, {'phone': '0733 000 000'}, format='json', HTTP_ACCEPT_LANGUAGE='rw')
    assert response.json()['errors']['confirmPhone'][0] == t('rw', 'erPhoneConfirm')


@pytest.mark.parametrize('wrong', ['', '0733 000 000', '0788 123 457', 'my number', None])
def test_a_wrong_confirm_phone_is_refused(person, auth_client, wrong):
    response = edit(person, auth_client, phone='0733 000 000', confirm_phone=wrong)
    assert response.status_code == 422 and response.json()['code'] == 'phone_confirm_mismatch'
    assert number_of(person) == CURRENT


@pytest.mark.parametrize('typed', ['+250788123456', '0788 123 456', '788123456', ' 0788-123-456 '])
def test_the_current_number_in_any_written_form_confirms_the_change(person, auth_client, typed):
    response = edit(person, auth_client, phone='0733 000 000', confirm_phone=typed)
    assert response.status_code == 200, response.content
    assert number_of(person) == '+250733000000'


def test_saving_the_same_number_changes_nothing_and_needs_no_confirmation(person, auth_client):
    assert edit(person, auth_client, phone='0788 123 456').status_code == 200
    assert number_of(person) == CURRENT


def test_a_name_only_change_never_asks_for_a_confirmation(person, auth_client):
    assert edit(person, auth_client, name='New Name').status_code == 200
    person.refresh_from_db()
    assert person.name == 'New Name' and person.phone == CURRENT


def test_the_name_and_a_new_number_are_saved_together_when_confirmed(person, auth_client):
    response = edit(person, auth_client, name='New Name', phone='0733 000 000', confirm_phone='0788 123 456')
    assert response.status_code == 200
    person.refresh_from_db()
    assert (person.name, person.phone) == ('New Name', '+250733000000')


def test_a_refused_number_leaves_the_name_alone_too(person, auth_client):
    edit(person, auth_client, name='New Name', phone='0733 000 000')
    person.refresh_from_db()
    assert person.name != 'New Name' and person.phone == CURRENT


@pytest.mark.parametrize('empty', [None, '', '   '])
def test_emptying_the_number_is_refused(person, auth_client, empty):
    response = edit(person, auth_client, phone=empty, confirm_phone='0788 123 456')
    assert response.status_code == 422
    assert response.json()['code'] == 'phone_required'
    assert number_of(person) == CURRENT


def test_a_number_held_by_someone_else_is_refused_even_when_confirmed(person, auth_client):
    UserFactory(phone='+250733000000')
    response = edit(person, auth_client, phone='0733 000 000', confirm_phone='0788 123 456')
    assert response.status_code == 422 and response.json()['code'] == 'phone_taken'
    assert number_of(person) == CURRENT


def test_a_new_number_that_is_not_a_rwandan_mobile_is_refused_as_before(person, auth_client):
    response = edit(person, auth_client, phone='12345', confirm_phone='0788 123 456')
    assert response.status_code == 422 and response.json()['code'] == 'invalid_phone'


def test_a_change_is_written_to_the_security_log_with_masked_numbers(person, auth_client):
    edit(person, auth_client, phone='0733 000 000', confirm_phone='0788 123 456')
    event = SecurityEvent.objects.get(kind='phone_changed')
    assert event.user_id == person.pk
    assert event.detail == '+250*****456 to +250*****000'
    assert '788123' not in event.detail and '733000' not in event.detail


def test_adding_a_first_number_is_logged_too(auth_client):
    nobody = UserFactory(phone=None)
    edit(nobody, auth_client, phone='0733 000 000')
    assert SecurityEvent.objects.get(kind='phone_changed').detail == 'none to +250*****000'


def test_a_refused_change_writes_no_event(person, auth_client):
    edit(person, auth_client, phone='0733 000 000')
    assert not SecurityEvent.objects.filter(kind='phone_changed').exists()


def test_the_new_error_has_a_text_in_all_three_languages():
    texts = {lang: t(lang, 'erPhoneConfirm') for lang in ('en', 'fr', 'rw')}
    assert len(set(texts.values())) == 3 and all(texts.values())


# ── the SSMS team ────────────────────────────────────────────────────────────────────────────

def admin_phone(auth_client, admin, user, number):
    return auth_client(admin).patch(f'/api/admin/users/{user.pk}/phone', {'phone': number}, format='json')


def test_the_team_can_clear_a_number_and_the_person_is_then_gated(auth_client, jwt_client, person):
    admin = UserFactory(role='ADMIN')
    assert admin_phone(auth_client, admin, person, None).status_code == 200
    assert number_of(person) is None
    response = jwt_client(person).get('/api/farms')
    assert response.status_code == 403 and response.json()['code'] == 'phone_required'
    assert SecurityEvent.objects.get(kind='phone_changed').detail == '+250*****456 to none'


def test_the_team_can_set_a_number_without_any_confirmation(auth_client, person):
    admin = UserFactory(role='ADMIN')
    assert admin_phone(auth_client, admin, person, '0733 000 000').status_code == 200
    assert number_of(person) == '+250733000000'


def test_the_team_cannot_give_a_number_that_is_taken(auth_client, person):
    UserFactory(phone='+250733000000')
    response = admin_phone(auth_client, UserFactory(role='ADMIN'), person, '0733 000 000')
    assert response.status_code == 422 and response.json()['code'] == 'phone_taken'
    assert number_of(person) == CURRENT


def test_the_team_gets_invalid_phone_for_a_bad_number(auth_client, person):
    response = admin_phone(auth_client, UserFactory(role='ADMIN'), person, '12345')
    assert response.status_code == 422 and response.json()['code'] == 'invalid_phone'


def test_the_admin_route_refuses_the_admins_own_number(auth_client):
    admin = UserFactory(role='ADMIN')
    response = admin_phone(auth_client, admin, admin, '0733 000 000')
    assert response.status_code == 400
    assert User.objects.get(pk=admin.pk).phone != '+250733000000'


def test_a_missing_user_is_a_404(auth_client):
    response = auth_client(UserFactory(role='ADMIN')).patch('/api/admin/users/nobody/phone', {'phone': '0733 000 000'}, format='json')
    assert response.status_code == 404


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_the_team_may_use_the_admin_route(auth_client, person, role):
    other = UserFactory(role=role)
    assert admin_phone(auth_client, other, person, '0733 000 000').status_code == 403
    assert number_of(person) == CURRENT
