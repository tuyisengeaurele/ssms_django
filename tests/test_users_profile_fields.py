"""The profile fields a person can have: phone, photo, language and the two-step prompt counters. All of them are optional.

A phone number is kept in E.164 (+250 and nine digits) and only a Rwandan mobile number is accepted. Two accounts cannot both hold
the same number, verified or not: see tests/test_phone_required.py.
"""
import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from tests.factories import UserFactory
from users.phone_numbers import normalize_rwanda_mobile
from users.serializers import UserSerializer

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize('typed', [
    '+250788123456', '250788123456', '0788123456', '788123456', '0788 123 456', '+250 788-123-456', ' (0788) 123456 ',
])
def test_a_rwandan_mobile_number_is_written_in_e164(typed):
    assert normalize_rwanda_mobile(typed) == '+250788123456'


@pytest.mark.parametrize('prefix', ['72', '73', '78', '79'])
def test_the_mobile_prefixes_in_use_are_accepted(prefix):
    assert normalize_rwanda_mobile(f'+250{prefix}1234567') == f'+250{prefix}1234567'


@pytest.mark.parametrize('typed', [
    '', '   ', 'abc', '+14155550123',        # not Rwandan
    '+250221234567',                         # a landline, not a mobile
    '+25078812345', '+2507881234567',        # too short, too long
    '+250 70 123 4567',                      # 70 is not a prefix in use
    '+250788123456 ext 2',
])
def test_anything_else_is_refused(typed):
    with pytest.raises(ValidationError):
        normalize_rwanda_mobile(typed)


def test_saving_a_user_stores_the_number_in_e164():
    user = UserFactory(phone='0788123456')
    user.refresh_from_db()
    assert user.phone == '+250788123456'


def test_saving_a_user_with_a_foreign_number_is_refused():
    with pytest.raises(ValidationError):
        UserFactory(phone='+14155550123')


def test_an_empty_number_is_stored_as_none_so_it_never_repeats_as_text():
    first, second = UserFactory(phone=''), UserFactory(phone='  ')
    first.refresh_from_db(), second.refresh_from_db()
    assert first.phone is None and second.phone is None


def test_two_accounts_cannot_both_hold_the_same_verified_number():
    UserFactory(phone='+250788123456', phone_verified_at=timezone.now())
    with pytest.raises(IntegrityError), transaction.atomic():
        UserFactory(phone='+250788123456', phone_verified_at=timezone.now())


def test_a_verified_number_cannot_be_held_next_to_an_unverified_copy():
    UserFactory(phone='+250788123456', phone_verified_at=timezone.now())
    with pytest.raises(IntegrityError), transaction.atomic():
        UserFactory(phone='+250788123456')


def test_a_new_account_has_the_documented_defaults():
    user = UserFactory(phone=None)
    assert user.phone is None and user.phone_verified_at is None
    assert user.photo_url is None
    assert user.preferred_language == 'en'
    assert user.mfa_prompt_snoozed_until is None and user.mfa_prompted_at is None
    assert user.mfa_prompt_dismissals == 0


def test_a_language_outside_the_three_is_refused_by_validation():
    user = UserFactory()
    user.preferred_language = 'sw'
    with pytest.raises(ValidationError) as raised:
        user.full_clean(exclude=['password'])
    assert 'preferred_language' in raised.value.message_dict


@pytest.mark.parametrize('language', ['en', 'fr', 'rw'])
def test_the_three_languages_are_accepted(language):
    user = UserFactory(preferred_language=language)
    user.full_clean(exclude=['password'])


def test_the_profile_answer_carries_the_new_fields_and_never_the_raw_counters():
    user = UserFactory(phone='+250788123456', photo_url='https://res.cloudinary.com/x/a.jpg', preferred_language='rw')
    data = UserSerializer(user).data
    assert data['phone'] == '+250788123456'
    assert data['phone_verified'] is False
    assert data['photo_url'] == 'https://res.cloudinary.com/x/a.jpg'
    assert data['preferred_language'] == 'rw'
    assert 'mfa_prompt_dismissals' not in data and 'mfa_prompted_at' not in data


def test_a_verified_phone_is_reported_as_verified():
    user = UserFactory(phone='+250788123456', phone_verified_at=timezone.now())
    assert UserSerializer(user).data['phone_verified'] is True


def test_the_serializer_cannot_change_the_new_fields():
    fields = UserSerializer.Meta.read_only_fields
    for name in ('phone', 'phone_verified', 'photo_url', 'preferred_language'):
        assert name in fields


@pytest.mark.django_db(transaction=True)
def test_the_migration_applies_and_reverses():
    def user_columns():
        with connection.cursor() as cursor:
            return {c.name for c in connection.introspection.get_table_description(cursor, 'users')}

    new = {'phone', 'phoneVerifiedAt', 'photoUrl', 'preferredLanguage', 'mfaPromptSnoozedUntil', 'mfaPromptDismissals', 'mfaPromptedAt'}
    assert new <= user_columns()
    try:
        call_command('migrate', 'users', '0011', verbosity=0)
        assert not (new & user_columns())
    finally:
        call_command('migrate', verbosity=0)
    assert new <= user_columns()
