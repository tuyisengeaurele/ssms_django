"""Every answer carries a reference, so a person can quote it and an admin can find what happened."""
import re
from unittest import mock

import pytest
from rest_framework.test import APIClient

from core.request_id import current_request_id
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

HEADER = 'X-Request-ID'
SHAPE = re.compile(r'^[A-Za-z0-9._-]{8,64}$')


def test_a_good_answer_has_a_reference():
    response = APIClient().get('/api/health')
    assert response.status_code == 200
    assert SHAPE.match(response[HEADER])


def test_a_refused_answer_has_one():
    response = APIClient().get('/api/auth/me')
    assert response.status_code == 401
    assert SHAPE.match(response[HEADER])


def test_a_page_that_does_not_exist_has_one():
    response = APIClient().get('/api/nothing/here')
    assert response.status_code == 404
    assert SHAPE.match(response[HEADER])


def test_a_crash_has_one():
    user = UserFactory()
    client = APIClient(raise_request_exception=False)
    client.force_authenticate(user=user)
    with mock.patch('users.views.ProfileView.get', side_effect=RuntimeError('boom')):
        response = client.get('/api/auth/me')
    assert response.status_code == 500
    assert SHAPE.match(response[HEADER])


def test_each_request_gets_its_own_reference():
    client = APIClient()
    assert client.get('/api/health')[HEADER] != client.get('/api/health')[HEADER]


def test_a_clean_reference_from_the_caller_is_kept():
    response = APIClient().get('/api/health', HTTP_X_REQUEST_ID='abc-123_DEF.456')
    assert response[HEADER] == 'abc-123_DEF.456'


@pytest.mark.parametrize('hostile', [
    'short', 'x' * 65, 'has space in it', 'new\nline-in-it', '<script>alert(1)</script>', 'semi;colon;12345', '', '../../etc/passwd',
])
def test_a_hostile_reference_from_the_caller_is_replaced(hostile):
    response = APIClient().get('/api/health', HTTP_X_REQUEST_ID=hostile)
    assert response[HEADER] != hostile
    assert SHAPE.match(response[HEADER])


def test_an_error_body_carries_the_same_reference():
    response = APIClient().get('/api/auth/me')
    assert response.json()['reference'] == response[HEADER]


def test_a_refusal_for_a_role_carries_it_too():
    farmer = UserFactory(role='FARMER')
    client = APIClient()
    client.force_authenticate(user=farmer)
    response = client.get('/api/admin/audit-log')
    assert response.status_code == 403
    assert response.json()['reference'] == response[HEADER]


def test_a_missing_api_page_has_a_json_body_with_the_reference():
    response = APIClient().get('/api/nothing/here')
    body = response.json()
    assert body['success'] is False and body['reference'] == response[HEADER]


def test_a_crash_answers_in_plain_json_with_the_reference_and_nothing_inside():
    user = UserFactory()
    client = APIClient(raise_request_exception=False)
    client.force_authenticate(user=user)
    with mock.patch('users.views.ProfileView.get', side_effect=RuntimeError('secret database detail')):
        response = client.get('/api/auth/me')
    body = response.json()
    assert body['reference'] == response[HEADER]
    assert 'secret' not in response.content.decode()
    assert 'Traceback' not in response.content.decode()


def test_a_good_answer_body_is_left_alone():
    assert 'reference' not in APIClient().get('/api/health').json()


def test_the_reference_is_known_while_the_request_runs_and_forgotten_after():
    seen = []
    user = UserFactory()
    client = APIClient()
    client.force_authenticate(user=user)

    def spy(self, request):
        seen.append(current_request_id())
        from core.utils import api_success
        return api_success({})

    with mock.patch('users.views.ProfileView.get', spy):
        response = client.get('/api/auth/me')
    assert seen == [response[HEADER]]
    assert current_request_id() == ''


def test_other_sites_may_read_the_reference(settings):
    assert 'X-Request-ID' in settings.CORS_EXPOSE_HEADERS
