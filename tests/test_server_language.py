"""The server answers in the language the web asks for, and says which sentence it means with a code.

The web sends `Accept-Language` with the language chosen in the picker. A missing or unknown language means English. An error carries
a `code` the web translates by itself, and the sentence in the same language for anyone else who reads the answer. The words come
from the web's own catalogue (copied into `core/doc_text.py`), so there is one place to change them.
"""
from unittest import mock

import pytest
from django.test import RequestFactory
from rest_framework.test import APIClient

from core.doc_text import TEXT, t
from core.error_text import CODE_KEYS, error_text
from core.language import LanguageMiddleware, current_language, language_from_header
from core.utils import api_error
from tests.factories import UserFactory

LOGIN = '/api/auth/login'
REGISTER = '/api/auth/register'
ME = '/api/auth/me'


# ── reading the header ──────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('header, expected', [
    (None, 'en'), ('', 'en'), ('   ', 'en'),
    ('en', 'en'), ('fr', 'fr'), ('rw', 'rw'),
    ('fr-FR', 'fr'), ('FR', 'fr'), ('rw-RW', 'rw'), ('kin', 'rw'),                    # kin is the code some systems use for Kinyarwanda
    ('fr-FR,fr;q=0.9,en;q=0.8', 'fr'),
    ('en-US,en;q=0.9,fr;q=0.8', 'en'),
    ('de, fr;q=0.5', 'fr'),                                                           # the first language we have
    ('fr;q=0.4, rw;q=0.9', 'rw'),                                                     # by weight, not by place
    ('fr;q=0, en;q=0.1', 'en'),                                                       # q=0 means not wanted
    ('sw', 'en'), ('*', 'en'), ('de, es', 'en'),
    (';;;,,q=', 'en'), ('fr;q=abc', 'en'), ('x' * 2000, 'en'),
])
def test_the_language_is_read_from_the_header(header, expected):
    assert language_from_header(header) == expected


def test_a_very_long_list_is_cut_short_rather_than_read_to_the_end():
    assert language_from_header(', '.join(['de'] * 500) + ', fr') == 'en'


# ── the middleware ──────────────────────────────────────────────────────────────────────────

def test_the_middleware_puts_the_language_on_the_request_for_the_length_of_the_call():
    seen = {}

    def view(request):
        seen['attr'], seen['current'] = request.language, current_language()
        return mock.Mock()

    request = RequestFactory().get('/x', HTTP_ACCEPT_LANGUAGE='rw')
    LanguageMiddleware(view)(request)
    assert seen == {'attr': 'rw', 'current': 'rw'}
    assert current_language() == 'en'          # back to the default once the call is over


def test_a_request_without_the_header_is_in_english():
    seen = {}
    LanguageMiddleware(lambda request: seen.setdefault('lang', request.language) and mock.Mock())(RequestFactory().get('/x'))
    assert seen['lang'] == 'en'


# ── the codes and their words ───────────────────────────────────────────────────────────────

def test_every_code_has_a_text_in_all_three_languages():
    for code, key in CODE_KEYS.items():
        for lang in ('en', 'fr', 'rw'):
            assert TEXT[lang][key], (code, lang)
            assert '{' not in error_text(code, lang, n=3), (code, lang)


def test_the_three_languages_say_it_differently():
    for code in CODE_KEYS:
        assert len({error_text(code, lang, n=3) for lang in ('en', 'fr', 'rw')}) == 3, code


def test_a_wait_is_told_in_seconds_with_a_singular_for_one():
    assert 'in 42 seconds' in error_text('throttled', 'en', n=42)
    assert 'in 1 second.' in error_text('throttled', 'en', n=1)
    assert 'dans 42 secondes' in error_text('throttled', 'fr', n=42)
    assert 'dans 1 seconde' in error_text('throttled', 'fr', n=1)


def test_an_unknown_code_has_no_text():
    assert error_text('no_such_code', 'fr') is None
    assert error_text(None, 'fr') is None


def test_api_error_with_a_known_code_speaks_the_language_of_the_call():
    request = RequestFactory().get('/x', HTTP_ACCEPT_LANGUAGE='fr')

    def view(_):
        response = api_error('English fallback', 401, code='bad_login')
        assert response.data['code'] == 'bad_login'
        assert response.data['message'] == t('fr', 'erBadLogin')
        return mock.Mock()

    LanguageMiddleware(view)(request)


def test_api_error_without_a_code_keeps_the_message_it_was_given():
    response = api_error('Only this.', 400)
    assert response.data['message'] == 'Only this.' and 'code' not in response.data


# ── what the person meets ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_a_wrong_password_returns_a_code_and_the_sentence_in_the_language_asked_for():
    UserFactory(email='real@example.rw')
    body = {'email': 'real@example.rw', 'password': 'Wrong1234'}
    for lang in ('en', 'fr', 'rw'):
        response = APIClient().post(LOGIN, body, format='json', HTTP_ACCEPT_LANGUAGE=lang)
        assert response.status_code == 401
        assert response.data['code'] == 'bad_login'
        assert response.data['message'] == t(lang, 'erBadLogin')


@pytest.mark.django_db
def test_a_missing_language_header_means_english():
    UserFactory(email='real@example.rw')
    response = APIClient().post(LOGIN, {'email': 'real@example.rw', 'password': 'Wrong1234'}, format='json')
    assert response.data['message'] == "Wrong email or password. Try again."
    assert response.data['code'] == 'bad_login'


@pytest.mark.django_db
def test_an_unknown_language_means_english():
    response = APIClient().post(LOGIN, {'email': 'nobody@example.rw', 'password': 'x'}, format='json', HTTP_ACCEPT_LANGUAGE='sw')
    assert response.data['message'] == t('en', 'erBadLogin')


@pytest.mark.django_db
def test_an_email_that_is_taken_returns_a_code_and_the_field_sentence_in_the_language_asked_for():
    UserFactory(email='taken@example.rw')
    body = {'name': 'Someone', 'email': 'taken@example.rw', 'password': 'Garden-Tree-4721', 'phone': '0788 000 111'}
    response = APIClient().post(REGISTER, body, format='json', HTTP_ACCEPT_LANGUAGE='fr')
    assert response.status_code == 422
    assert response.data['code'] == 'email_taken'
    assert response.data['errors']['email'][0] == t('fr', 'erEmailTaken')


@pytest.mark.django_db
def test_a_field_error_with_no_case_of_ours_gets_the_general_code_and_keeps_its_own_words():
    response = APIClient().post(REGISTER, {'name': '', 'email': 'not-an-email', 'password': 'x', 'phone': '0788 000 111'}, format='json', HTTP_ACCEPT_LANGUAGE='fr')
    assert response.status_code == 422
    assert response.data['code'] == 'invalid_input'
    assert response.data['message'] == t('fr', 'erCheckInput')
    assert str(response.data['errors']['email'][0]) == 'Enter a valid email address.'   # Django REST framework's words, not ours yet


@pytest.mark.django_db
@pytest.mark.throttle
def test_a_slow_down_returns_a_code_the_wait_and_the_sentence_in_the_language_asked_for():
    import core.throttles as throttles
    with mock.patch.object(throttles.LoginRateThrottle, 'rate', '1/minute', create=True):
        responses = [
            APIClient().post(LOGIN, {'email': 'a@example.rw', 'password': 'x'}, format='json', HTTP_ACCEPT_LANGUAGE='fr')
            for _ in range(3)
        ]
    slowed = responses[-1]
    assert slowed.status_code == 429
    assert slowed.data['code'] == 'throttled'
    assert slowed.data['retryAfter'] >= 1
    assert 'secondes' in slowed.data['message'] or 'seconde' in slowed.data['message']


@pytest.mark.django_db
def test_a_locked_email_returns_the_same_code():
    from core import lockout
    UserFactory(email='locked@example.rw')
    for _ in range(6):
        lockout.record_failure('locked@example.rw')
    response = APIClient().post(LOGIN, {'email': 'locked@example.rw', 'password': 'x'}, format='json', HTTP_ACCEPT_LANGUAGE='rw')
    assert response.status_code == 429
    assert response.data['code'] == 'throttled'
    assert 'minota' in response.data['message']


@pytest.mark.django_db
@pytest.mark.parametrize('lang', ['en', 'fr', 'rw'])
def test_a_stranger_is_asked_to_sign_in_in_the_language_asked_for(lang):
    response = APIClient().get(ME, HTTP_ACCEPT_LANGUAGE=lang)
    assert response.status_code == 401
    assert response.data['code'] == 'not_authenticated'
    assert response.data['message'] == error_text('not_authenticated', lang)


@pytest.mark.django_db
def test_a_role_that_is_refused_gets_a_code(auth_client):
    response = auth_client(UserFactory(role='FARMER')).get('/api/admin/audit-log', HTTP_ACCEPT_LANGUAGE='rw')
    assert response.status_code == 403
    assert response.data['code'] == 'forbidden'
    assert response.data['message'] == t('rw', 'erForbidden')


@pytest.mark.django_db
def test_an_address_the_api_does_not_have_gets_a_code():
    response = APIClient().get('/api/no-such-thing', HTTP_ACCEPT_LANGUAGE='fr')
    assert response.status_code == 404
    body = response.json()
    assert body['code'] == 'not_found'
    assert body['message'] == t('fr', 'erNotFound')


@pytest.mark.django_db
def test_a_wrong_method_gets_a_code(auth_client):
    response = auth_client(UserFactory()).delete(ME, HTTP_ACCEPT_LANGUAGE='fr')
    assert response.status_code == 405
    assert response.data['code'] == 'method_not_allowed'


def test_the_web_translates_the_same_codes_to_the_same_catalogue_keys():
    import re
    from pathlib import Path
    source = (Path(__file__).resolve().parents[1] / 'frontend' / 'src' / 'utils' / 'errorCodes.ts').read_text(encoding='utf-8')
    web = dict(re.findall(r"^\s+(\w+): '(\w+)',$", source, re.MULTILINE))
    assert web == CODE_KEYS
