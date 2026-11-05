"""The challenge: what an admin holds between a correct password and a correct code.

It is not a login. It names one person, works for one step, expires, and dies when it is spent or guessed against.
"""
import time
from unittest import mock

import pytest
from django.core import signing
from rest_framework.test import APIClient

from tests.factories import UserFactory
from users import mfa_challenge as challenge

pytestmark = pytest.mark.django_db


def test_a_challenge_names_the_person_and_the_step():
    user = UserFactory(role='ADMIN')
    held = challenge.read(challenge.issue(user, 'code'))
    assert held.user_id == user.pk and held.step == 'code'
    assert challenge.read(challenge.issue(user, 'setup')).step == 'setup'


def test_only_the_two_known_steps_can_be_issued():
    with pytest.raises(ValueError):
        challenge.issue(UserFactory(role='ADMIN'), 'anything')


def test_two_challenges_for_the_same_person_are_independent():
    user = UserFactory(role='ADMIN')
    first, second = challenge.issue(user, 'code'), challenge.issue(user, 'code')
    assert first != second
    challenge.spend(challenge.read(first))
    assert challenge.read(second).user_id == user.pk


def test_a_challenge_older_than_five_minutes_is_refused():
    token = challenge.issue(UserFactory(role='ADMIN'), 'code')
    later = time.time() + challenge.CHALLENGE_SECONDS + 1
    with mock.patch('time.time', return_value=later), pytest.raises(challenge.ChallengeError):
        challenge.read(token)


def test_a_challenge_just_under_five_minutes_old_still_works():
    token = challenge.issue(UserFactory(role='ADMIN'), 'code')
    with mock.patch('time.time', return_value=time.time() + challenge.CHALLENGE_SECONDS - 5):
        assert challenge.read(token).step == 'code'


def test_a_changed_challenge_is_refused():
    token = challenge.issue(UserFactory(role='ADMIN'), 'code')
    middle = len(token) // 2
    swapped = 'A' if token[middle] != 'A' else 'B'
    with pytest.raises(challenge.ChallengeError):
        challenge.read(token[:middle] + swapped + token[middle + 1:])


@pytest.mark.parametrize('garbage', ['', 'abc', 'a:b:c', ' ', 'x' * 300, None, 123, {}, ['a'], True])
def test_garbage_is_refused_with_the_same_error(garbage):
    with pytest.raises(challenge.ChallengeError):
        challenge.read(garbage)


def test_a_value_signed_for_something_else_is_refused():
    user = UserFactory(role='ADMIN')
    other = signing.dumps({'u': user.pk, 's': 'code', 'n': 'x'}, salt='some.other.purpose')
    with pytest.raises(challenge.ChallengeError):
        challenge.read(other)


@pytest.mark.parametrize('payload', [{}, {'u': 'a'}, {'u': 'a', 's': 'nope', 'n': 'x'}, {'u': 1, 's': 'code', 'n': 'x'}, ['a']])
def test_a_value_with_the_right_signature_but_the_wrong_shape_is_refused(payload):
    with pytest.raises(challenge.ChallengeError):
        challenge.read(signing.dumps(payload, salt=challenge.SALT))


def test_a_spent_challenge_cannot_be_read_again():
    token = challenge.issue(UserFactory(role='ADMIN'), 'code')
    challenge.spend(challenge.read(token))
    with pytest.raises(challenge.ChallengeError):
        challenge.read(token)


def test_five_wrong_codes_kill_the_challenge():
    token = challenge.issue(UserFactory(role='ADMIN'), 'code')
    held = challenge.read(token)
    assert [challenge.wrong_code(held) for _ in range(4)] == [False] * 4
    assert challenge.wrong_code(held) is True
    with pytest.raises(challenge.ChallengeError):
        challenge.read(token)


def test_wrong_codes_on_one_challenge_do_not_count_against_another():
    user = UserFactory(role='ADMIN')
    first, second = challenge.read(challenge.issue(user, 'code')), challenge.issue(user, 'code')
    for _ in range(5):
        challenge.wrong_code(first)
    assert challenge.read(second).user_id == user.pk


def test_a_challenge_is_not_an_access_token():
    user = UserFactory(role='ADMIN')
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {challenge.issue(user, "code")}')
    assert client.get('/api/auth/me').status_code == 401
