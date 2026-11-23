"""Every account has a phone number, and no two accounts share one.

A number is asked for when registering, when joining by an invitation and when an administrator adds a person. The
database refuses a second account with the same number, whichever way it was written.
"""
from unittest import mock

import pytest
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from rest_framework.test import APIClient

from core.doc_text import t
from tests.factories import CooperativeFactory, UserFactory
from users.models import User
from users.phone_numbers import mask_phone

pytestmark = pytest.mark.django_db

REGISTER = '/api/auth/register'
PASSWORD = 'Garden-Tree-4721'


def register(lang='en', **extra):
    body = {'name': 'Aline Uwase', 'email': 'aline@example.rw', 'password': PASSWORD, 'acceptedTerms': True, **extra}
    return APIClient().post(REGISTER, body, format='json', HTTP_ACCEPT_LANGUAGE=lang)


@pytest.mark.parametrize('empty', [None, '', '   '])
def test_register_with_an_empty_number_is_refused_and_makes_no_account(empty):
    response = register(phone=empty)
    assert response.status_code == 422
    assert response.json()['code'] == 'phone_required'
    assert response.json()['errors']['phone'][0] == t('en', 'erPhoneRequired')
    assert not User.objects.filter(email='aline@example.rw').exists()


def test_register_with_no_phone_key_at_all_is_refused_the_same_way():
    response = register()
    assert response.status_code == 422
    assert response.json()['code'] == 'phone_required'
    assert not User.objects.filter(email='aline@example.rw').exists()


@pytest.mark.parametrize('written', ['0788 123 456', '788123456', '+250 788 123 456', '250788123456'])
def test_a_taken_number_is_refused_whichever_way_it_is_written(written):
    UserFactory(phone='+250788123456', email='first@example.rw', name='First Person')
    response = register(phone=written)
    assert response.status_code == 422
    assert response.json()['code'] == 'phone_taken'
    assert not User.objects.filter(email='aline@example.rw').exists()
    text = response.content.decode()
    assert 'first@example.rw' not in text and 'First Person' not in text


def test_the_refusals_are_written_in_the_language_asked_for():
    UserFactory(phone='+250788123456')
    taken = register(lang='fr', phone='0788 123 456').json()['errors']['phone'][0]
    missing = register(lang='rw', phone='').json()['errors']['phone'][0]
    assert taken == t('fr', 'erPhoneTaken')
    assert missing == t('rw', 'erPhoneRequired')


def test_every_new_error_has_a_text_in_all_three_languages():
    for key in ('erPhoneRequired', 'erPhoneTaken'):
        texts = {lang: t(lang, key) for lang in ('en', 'fr', 'rw')}
        assert all(texts.values()), key
        assert len(set(texts.values())) == 3, key


def test_joining_by_an_invitation_needs_a_number_too():
    from cooperatives import invitations
    coop = CooperativeFactory()
    _, token = invitations.issue(coop, UserFactory(role='SUPERVISOR', cooperative=coop))
    assert register(invitation=token).status_code == 422
    assert register(phone='0722 000 111', invitation=token).status_code == 201


def test_an_administrator_adding_a_person_must_give_a_number(auth_client):
    admin = UserFactory(role='ADMIN')
    body = {'name': 'New Person', 'email': 'new@example.rw', 'role': 'FARMER'}
    response = auth_client(admin).post('/api/admin/users', body, format='json')
    assert response.status_code == 422
    assert response.json()['code'] == 'phone_required'
    assert not User.objects.filter(email='new@example.rw').exists()


def test_an_administrator_cannot_give_a_number_that_is_taken(auth_client):
    admin = UserFactory(role='ADMIN')
    UserFactory(phone='+250788123456')
    response = auth_client(admin).post(
        '/api/admin/users', {'name': 'New Person', 'email': 'new@example.rw', 'role': 'FARMER', 'phone': '0788 123 456'}, format='json',
    )
    assert response.status_code == 422
    assert response.json()['code'] == 'phone_taken'
    assert not User.objects.filter(email='new@example.rw').exists()


def test_two_accounts_cannot_share_a_number_in_the_database_even_when_neither_is_confirmed():
    UserFactory(phone='+250788123456')
    with pytest.raises(IntegrityError), transaction.atomic():
        UserFactory(phone='+250788123456')


def test_many_accounts_without_a_number_can_still_exist():
    for _ in range(3):
        UserFactory(phone=None)
    assert User.objects.filter(phone__isnull=True).count() == 3


def test_a_race_on_the_same_number_becomes_phone_taken_and_leaves_no_account():
    UserFactory(phone='+250788123456')
    # The friendly check sees nothing, as it would if the other sign up had not committed yet. The database then refuses.
    with mock.patch('users.serializers.phone_in_use', return_value=False):
        response = register(phone='0788 123 456')
    assert response.status_code == 422
    assert response.json()['code'] == 'phone_taken'
    assert not User.objects.filter(email='aline@example.rw').exists()


def test_mask_phone_keeps_only_the_last_three_digits():
    assert mask_phone('+250788123456') == '+250*****456'
    assert '788123' not in mask_phone('+250788123456')


@pytest.mark.django_db(transaction=True)
def test_the_old_conditional_rule_is_replaced_by_a_plain_one():
    executor = MigrationExecutor(connection)
    executor.migrate([('users', '0013_notification_preferences')])
    old = executor.loader.project_state([('users', '0013_notification_preferences')]).apps
    OldUser = old.get_model('users', 'User')
    OldUser.objects.create(id='a' * 20, email='a@example.rw', name='A', phone='+250788123456')
    OldUser.objects.create(id='b' * 20, email='b@example.rw', name='B', phone='+250788123456')  # allowed before: nobody was confirmed
    OldUser.objects.filter(pk='b' * 20).update(phone=None)

    executor = MigrationExecutor(connection)
    executor.migrate([('users', '0014_phone_unique')])
    new = executor.loader.project_state([('users', '0014_phone_unique')]).apps
    NewUser = new.get_model('users', 'User')
    with pytest.raises(IntegrityError), transaction.atomic():
        NewUser.objects.create(id='c' * 20, email='c@example.rw', name='C', phone='+250788123456')
    NewUser.objects.create(id='d' * 20, email='d@example.rw', name='D', phone=None)
    NewUser.objects.create(id='e' * 20, email='e@example.rw', name='E', phone=None)
