"""Throwaway farmers for the load test. The API limits each person to 300 requests a minute, so 50 people at once
need 50 accounts, not one account used 50 times."""
import json

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from batches.models import Batch
from farms.models import Farm
from users.models import Role, User

pytestmark = pytest.mark.django_db

LOAD_USERS = User.objects.filter(email__startswith='loadtest', email__endswith='@example.invalid')


def prepare(tmp_path, *args):
    target = tmp_path / 'tokens.json'
    call_command('prepare_load_test', '--tokens-file', str(target), *args)
    return target


def test_it_makes_the_asked_number_of_verified_farmers_each_with_a_farm_and_two_batches(tmp_path):
    prepare(tmp_path, '--users', '3')
    users = list(LOAD_USERS.order_by('email'))
    assert len(users) == 3
    for user in users:
        assert user.role == Role.FARMER and user.is_email_verified and user.is_active
        assert Farm.objects.filter(owner=user).count() == 1
        assert Batch.objects.filter(farm__owner=user).count() == 2


def test_it_writes_one_working_token_for_each_account(tmp_path):
    target = prepare(tmp_path, '--users', '2')
    tokens = json.loads(target.read_text(encoding='utf-8'))['tokens']
    assert len(tokens) == 2 and len(set(tokens)) == 2
    for token, user in zip(tokens, LOAD_USERS.order_by('email'), strict=True):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        answer = client.get('/api/auth/me')
        assert answer.status_code == 200
        assert answer.json()['data']['email'] == user.email


def test_running_it_twice_does_not_make_the_accounts_twice(tmp_path):
    prepare(tmp_path, '--users', '3')
    prepare(tmp_path, '--users', '3')
    assert LOAD_USERS.count() == 3
    assert Farm.objects.filter(owner__in=LOAD_USERS).count() == 3
    assert Batch.objects.filter(farm__owner__in=LOAD_USERS).count() == 6


def test_remove_deletes_only_the_throwaway_accounts_and_what_they_own(tmp_path):
    keeper = User.objects.create_user(email='real@example.rw', name='Real Person', is_email_verified=True)
    Farm.objects.create(name='Real farm', location='Gatsibo', owner=keeper)
    prepare(tmp_path, '--users', '3')
    call_command('prepare_load_test', '--remove')
    assert LOAD_USERS.count() == 0
    assert not Farm.objects.filter(name='Load test farm').exists()
    assert User.objects.filter(pk=keeper.pk).exists() and Farm.objects.filter(owner=keeper).count() == 1


@pytest.mark.parametrize('count', ['0', '-1', '201'])
def test_a_silly_number_of_accounts_is_refused(tmp_path, count):
    with pytest.raises(CommandError):
        prepare(tmp_path, '--users', count)
    assert LOAD_USERS.count() == 0


def test_the_default_tokens_file_can_never_be_committed():
    from pathlib import Path
    ignored = (Path(__file__).resolve().parents[1] / '.gitignore').read_text(encoding='utf-8').splitlines()
    assert 'load_tokens.json' in [line.strip() for line in ignored]
