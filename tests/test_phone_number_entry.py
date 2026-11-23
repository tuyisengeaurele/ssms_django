"""A person can give a phone number when they register, and add, change or remove it later in their account.

There is no SMS provider yet, so nothing is sent to a number: it is kept in one form (+250 and nine digits), whichever way the person
wrote it, and is not checked beyond being a Rwandan mobile. Confirming a number with a code comes when there is a provider to send it.
A number is required and unique: see tests/test_phone_required.py.
"""
import pytest
from rest_framework.test import APIClient

from tests.factories import CooperativeFactory, FarmFactory, UserFactory
from users.models import User

pytestmark = pytest.mark.django_db

REGISTER = '/api/auth/register'
ME = '/api/auth/me'
PASSWORD = 'Garden-Tree-4721'


def register(**extra):
    body = {'name': 'Aline Uwase', 'email': 'aline@example.rw', 'password': PASSWORD, 'acceptedTerms': True, **extra}
    return APIClient().post(REGISTER, body, format='json')


# ── registering ──────────────────────────────────────────────────────────────────────────────

def test_a_number_given_when_registering_is_kept_in_one_form():
    response = register(phone='0788 123 456')
    assert response.status_code == 201
    user = User.objects.get(email='aline@example.rw')
    assert user.phone == '+250788123456'
    body = response.json()['data']['user']
    assert body['phone'] == '+250788123456'


@pytest.mark.parametrize('written', ['0788123456', '788 123 456', '+250 788 123 456', '250788123456', '0788-123-456'])
def test_the_usual_ways_of_writing_a_number_all_give_the_same_one(written):
    register(phone=written)
    assert User.objects.get(email='aline@example.rw').phone == '+250788123456'


@pytest.mark.parametrize('bad', ['12345', '0788', '+33612345678', '0711234567', 'call me', '078812345678'])
def test_a_number_that_is_not_a_rwandan_mobile_is_refused_with_a_code_and_the_account_is_not_made(bad):
    response = register(phone=bad)
    assert response.status_code == 422
    assert response.json()['code'] == 'invalid_phone'
    assert 'phone' in response.json()['errors']
    assert not User.objects.filter(email='aline@example.rw').exists()


def test_the_refusal_is_in_the_language_asked_for():
    from core.doc_text import t
    response = APIClient().post(
        REGISTER, {'name': 'A', 'email': 'a@example.rw', 'password': PASSWORD, 'phone': '123'}, format='json', HTTP_ACCEPT_LANGUAGE='fr',
    )
    assert response.json()['errors']['phone'][0] == t('fr', 'erBadPhone')


def test_a_number_can_be_given_when_joining_by_an_invitation():
    from cooperatives import invitations
    coop = CooperativeFactory()
    _, token = invitations.issue(coop, UserFactory(role='SUPERVISOR', cooperative=coop))
    response = register(phone='0722 000 111', invitation=token)
    assert response.status_code == 201
    user = User.objects.get(email='aline@example.rw')
    assert user.phone == '+250722000111' and user.cooperative_id == coop.pk


# ── changing it later ────────────────────────────────────────────────────────────────────────

@pytest.fixture
def person():
    # No number yet: these tests are about adding, changing and removing one.
    return UserFactory(name='Aline', phone=None)


def edit(person, auth_client, **body):
    return auth_client(person).patch(ME, body, format='json')


def test_a_person_with_no_number_can_add_one(person, auth_client):
    response = edit(person, auth_client, phone='0788 123 456')
    assert response.status_code == 200
    person.refresh_from_db()
    assert person.phone == '+250788123456'
    assert response.json()['data']['phone'] == '+250788123456'


def test_a_person_can_change_their_number_and_the_name_is_left_alone(person, auth_client):
    person.phone = '+250788123456'
    person.save()
    edit(person, auth_client, phone='0732 111 222')
    person.refresh_from_db()
    assert person.phone == '+250732111222' and person.name == 'Aline'


@pytest.mark.parametrize('empty', [None, '', '  '])
def test_a_person_can_remove_their_number(person, auth_client, empty):
    person.phone = '+250788123456'
    person.save()
    assert edit(person, auth_client, phone=empty).status_code == 200
    person.refresh_from_db()
    assert person.phone is None


def test_the_name_and_the_number_can_be_saved_together(person, auth_client):
    edit(person, auth_client, name='Aline Uwase', phone='0788 123 456')
    person.refresh_from_db()
    assert (person.name, person.phone) == ('Aline Uwase', '+250788123456')


def test_a_bad_number_is_refused_and_nothing_changes(person, auth_client):
    person.phone = '+250788123456'
    person.save()
    response = edit(person, auth_client, name='New name', phone='12345')
    assert response.status_code == 422 and response.json()['code'] == 'invalid_phone'
    person.refresh_from_db()
    assert (person.phone, person.name) == ('+250788123456', 'Aline')


def test_saving_the_name_alone_leaves_the_number_as_it_was(person, auth_client):
    person.phone = '+250788123456'
    person.save()
    edit(person, auth_client, name='Aline U')
    person.refresh_from_db()
    assert person.phone == '+250788123456' and person.name == 'Aline U'


def test_a_save_that_says_nothing_is_still_refused_as_before(person, auth_client):
    response = edit(person, auth_client)
    assert response.status_code == 422


def test_an_empty_name_is_still_refused_whatever_the_number(person, auth_client):
    assert edit(person, auth_client, name='  ', phone='0788 123 456').status_code == 422
    person.refresh_from_db()
    assert person.phone is None


def test_two_people_cannot_hold_the_same_number(auth_client):
    first, second = UserFactory(phone=None), UserFactory(phone=None)
    assert edit(first, auth_client, phone='0788 123 456').status_code == 200
    response = edit(second, auth_client, phone='0788 123 456')
    assert response.status_code == 422 and response.json()['code'] == 'phone_taken'
    second.refresh_from_db()
    assert second.phone is None


# ── who can see a number ─────────────────────────────────────────────────────────────────────

def test_nobody_else_is_shown_a_farmers_number(auth_client):
    """The cooperative's own lists do not carry numbers yet. Showing them to the staff is a separate, deliberate step."""
    coop = CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    farmer = UserFactory(cooperative=coop, phone='+250788123456')
    FarmFactory(owner=farmer)
    other_farmer = UserFactory(cooperative=coop)
    for who, url in ((supervisor, '/api/team/farmers'), (supervisor, f'/api/cooperatives/{coop.pk}'), (other_farmer, '/api/auth/me')):
        response = auth_client(who).get(url)
        assert response.status_code == 200, url
        assert '788123456' not in response.content.decode(), url


def test_a_person_reads_their_own_number_back(person, auth_client):
    edit(person, auth_client, phone='0788 123 456')
    assert auth_client(person).get(ME).json()['data']['phone'] == '+250788123456'


# ── an administrator adds a person ───────────────────────────────────────────────────────────

def test_an_administrator_can_add_a_person_with_a_number(auth_client):
    admin = UserFactory(role='ADMIN')
    response = auth_client(admin).post(
        '/api/admin/users', {'name': 'New Person', 'email': 'new@example.rw', 'role': 'FARMER', 'phone': '0788 123 456'}, format='json',
    )
    assert response.status_code == 201
    assert User.objects.get(email='new@example.rw').phone == '+250788123456'


def test_an_administrator_adding_a_person_gets_the_same_refusal_for_a_bad_number(auth_client):
    admin = UserFactory(role='ADMIN')
    response = auth_client(admin).post(
        '/api/admin/users', {'name': 'New Person', 'email': 'new@example.rw', 'role': 'FARMER', 'phone': '99'}, format='json',
    )
    assert response.status_code == 422
    assert not User.objects.filter(email='new@example.rw').exists()
