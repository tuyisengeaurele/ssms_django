"""The pieces every sensitive action shares: the typed confirmation, the password check, the error answer, the throttle.

Changing an email, closing an account and downloading the data all ask for typed text and the password. The checks live
once, here, and the routes that use them are tested in their own files.
"""
import pytest
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.views import APIView

from core import throttles
from core.doc_text import t
from core.language import _current
from core.permissions_table import ADMIN, FARMER, SUPERVISOR, may
from core.sensitive import SensitiveRateThrottle, mask_email, require_password, require_typed, sensitive_error
from core.support_rules import decide
from logs.security import KINDS
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def code_of(exc: ValidationError, field: str) -> str:
    return exc.detail[field][0].code


# ── the typed confirmation ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('typed', ['aline@example.rw', 'ALINE@EXAMPLE.RW', '  aline@example.rw  ', 'Aline@Example.rw '])
def test_require_typed_ignores_case_and_surrounding_spaces(typed):
    require_typed(typed, 'aline@example.rw')


@pytest.mark.parametrize('typed', ['', '   ', None, 'aline@example', 'bruce@example.rw', 'aline @example.rw'])
def test_require_typed_refuses_other_text_with_code_confirm_mismatch_on_the_field(typed):
    with pytest.raises(ValidationError) as raised:
        require_typed(typed, 'aline@example.rw')
    assert code_of(raised.value, 'confirm_email') == 'confirm_mismatch'


def test_require_typed_names_the_field_it_was_given():
    with pytest.raises(ValidationError) as raised:
        require_typed('x', 'aline@example.rw', field='confirm_phone')
    assert code_of(raised.value, 'confirm_phone') == 'confirm_mismatch'


def test_require_typed_can_be_case_sensitive():
    require_typed('DELETE', 'DELETE', ignore_case=False)
    with pytest.raises(ValidationError):
        require_typed('delete', 'DELETE', ignore_case=False)


# ── the password ─────────────────────────────────────────────────────────────────────────────

def test_require_password_accepts_the_right_one():
    user = UserFactory(password='Garden-Tree-4721')
    require_password(user, 'Garden-Tree-4721')


@pytest.mark.parametrize('given', ['', '   ', None, 'garden-tree-4721', 'Garden-Tree-4722'])
def test_require_password_refuses_a_wrong_or_empty_one_with_code_wrong_password(given):
    user = UserFactory(password='Garden-Tree-4721')
    with pytest.raises(ValidationError) as raised:
        require_password(user, given)
    assert code_of(raised.value, 'password') == 'wrong_password'


def test_require_password_refuses_an_account_with_no_usable_password():
    user = UserFactory()
    user.set_unusable_password()
    user.save()
    with pytest.raises(ValidationError):
        require_password(user, 'anything')


# ── the answer ───────────────────────────────────────────────────────────────────────────────

def test_sensitive_error_is_a_422_with_the_field_and_the_code():
    response = sensitive_error('wrong_password', 'That password is not right.', 'password')
    assert response.status_code == 422
    body = response.data
    assert body['code'] == 'wrong_password'
    assert body['errors']['password'][0] == t('en', 'erWrongPassword')


def test_sensitive_error_is_written_in_the_language_asked_for():
    token = _current.set('fr')
    try:
        response = sensitive_error('confirm_mismatch', 'Type it exactly as shown to confirm.', 'confirm_email')
    finally:
        _current.reset(token)
    assert response.data['errors']['confirm_email'][0] == t('fr', 'erConfirmTyped')


def test_every_new_error_has_a_text_in_all_three_languages():
    for key in ('erConfirmTyped', 'erWrongPassword'):
        texts = {lang: t(lang, key) for lang in ('en', 'fr', 'rw')}
        assert all(texts.values()), key
        assert len(set(texts.values())) == 3, key


# ── the mask ─────────────────────────────────────────────────────────────────────────────────

def test_mask_email_hides_all_but_the_first_letter_and_the_domain():
    assert mask_email('aline@example.rw') == 'a***@example.rw'
    assert 'line' not in mask_email('aline@example.rw')


@pytest.mark.parametrize('text,expected', [('a@example.rw', 'a***@example.rw'), ('no-at-sign', '***'), ('', '***'), (None, '***')])
def test_mask_email_handles_a_one_letter_name_and_text_that_is_not_an_address(text, expected):
    assert mask_email(text) == expected


# ── the throttle ─────────────────────────────────────────────────────────────────────────────

class Probe(APIView):
    throttle_classes = [SensitiveRateThrottle]

    def post(self, request):
        return Response({'ok': True})


@pytest.mark.throttle
def test_the_throttle_allows_five_a_minute_per_person_and_then_says_how_long():
    first, second = UserFactory(), UserFactory()
    view = Probe.as_view()

    def call(user):
        request = APIRequestFactory().post('/probe')
        force_authenticate(request, user=user)
        return view(request)

    assert [call(first).status_code for _ in range(5)] == [200] * 5
    refused = call(first)
    assert refused.status_code == 429
    assert int(refused['Retry-After']) >= 1
    # Another person is not slowed down by the first one.
    assert call(second).status_code == 200


def test_the_throttle_rate_is_five_a_minute():
    from django.conf import settings
    assert settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['sensitive'] == '5/minute'
    assert SensitiveRateThrottle.scope == 'sensitive'
    assert issubclass(SensitiveRateThrottle, throttles.UserRateThrottle)


# ── the log, the table and support access ────────────────────────────────────────────────────

@pytest.mark.parametrize('kind', [
    'email_change_asked', 'email_changed', 'email_change_undone',
    'deletion_scheduled', 'deletion_cancelled', 'account_anonymised', 'data_exported',
])
def test_the_new_security_kinds_exist_with_plain_words(kind):
    assert kind in KINDS
    assert KINDS[kind] and KINDS[kind][0].isupper() and chr(8212) not in KINDS[kind]


def test_the_new_resources_are_in_the_permission_table():
    assert may(FARMER, 'account_security', 'email_change') and may(SUPERVISOR, 'account_security', 'email_change') and may(ADMIN, 'account_security', 'email_change')
    assert may(FARMER, 'account_security', 'export') and may(ADMIN, 'account_security', 'export')
    # Closing is open to every role at the door: the route then tells staff, in plain words, to ask the SSMS team.
    assert may(SUPERVISOR, 'account_security', 'delete') and may(ADMIN, 'account_security', 'delete')
    for action in ('read', 'create', 'withdraw'):
        assert may(FARMER, 'cooperative_requests', action) and may(SUPERVISOR, 'cooperative_requests', action)
        assert not may(ADMIN, 'cooperative_requests', action)
    for action in ('review', 'decide'):
        assert may(ADMIN, 'cooperative_requests', action)
        assert not may(FARMER, 'cooperative_requests', action) and not may(SUPERVISOR, 'cooperative_requests', action)
    assert may(FARMER, 'cooperative_options', 'read') and may(SUPERVISOR, 'cooperative_options', 'read')
    assert not may(ADMIN, 'cooperative_options', 'read')


@pytest.mark.parametrize('resource,action', [
    ('account_security', 'email_change'), ('account_security', 'delete'), ('account_security', 'export'),
    ('cooperative_requests', 'create'), ('cooperative_requests', 'read'), ('cooperative_requests', 'decide'), ('cooperative_options', 'read'),
])
@pytest.mark.parametrize('method', ['GET', 'POST'])
@pytest.mark.parametrize('mode', ['view', 'edit'])
def test_support_access_cannot_use_the_new_resources_even_to_look(resource, action, method, mode):
    assert decide(resource, action, method, mode) is not None
