"""Log lines are one JSON object each, with the reference of the request, so the host's log viewer can search them."""
import io
import json
import logging
from unittest import mock

import pytest

from core import request_id
from core.logging import JsonFormatter, RequestIdFilter, sentry_before_send


def line_for(message, level=logging.INFO, exc_info=None, name='ssms.test'):
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RequestIdFilter())
    logger = logging.getLogger(name)
    logger.handlers = [handler]
    logger.propagate = False
    logger.setLevel(logging.DEBUG)
    logger.log(level, message, exc_info=exc_info)
    return stream.getvalue()


def test_a_line_is_one_json_object():
    text = line_for('Something happened')
    assert text.count('\n') == 1
    body = json.loads(text)
    assert body['message'] == 'Something happened'
    assert body['level'] == 'INFO' and body['logger'] == 'ssms.test'
    assert 'time' in body


def test_a_line_carries_the_reference_of_the_request_being_answered():
    token = request_id._current.set('REF123456789')
    try:
        body = json.loads(line_for('Inside a request'))
    finally:
        request_id._current.reset(token)
    assert body['request_id'] == 'REF123456789'


def test_a_line_outside_a_request_has_an_empty_reference():
    assert json.loads(line_for('At startup'))['request_id'] == ''


def test_a_message_with_line_breaks_stays_on_one_line():
    text = line_for('first\nsecond\r\nthird')
    assert text.count('\n') == 1
    assert json.loads(text)['message'] == 'first\nsecond\r\nthird'


def test_arguments_are_filled_in():
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger('ssms.args')
    logger.handlers, logger.propagate = [handler], False
    logger.warning('Could not send to %s after %d tries', 'a@example.rw', 3)
    assert json.loads(stream.getvalue())['message'] == 'Could not send to a@example.rw after 3 tries'


def test_an_error_carries_its_traceback_in_one_field():
    try:
        raise RuntimeError('boom')
    except RuntimeError:
        import sys
        text = line_for('It broke', logging.ERROR, exc_info=sys.exc_info())
    body = json.loads(text)
    assert 'RuntimeError: boom' in body['exception']
    assert text.count('\n') == 1


def test_the_level_comes_from_the_settings(settings):
    from django.conf import settings as site
    assert site.LOGGING['root']['level'] in {'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'}
    assert site.LOGGING['formatters']['json']['()'] == 'core.logging.JsonFormatter'


def test_the_site_logs_json_to_the_console():
    from django.conf import settings as site
    handler = site.LOGGING['handlers']['console']
    assert handler['formatter'] == 'json' and 'request_id' in handler['filters']


def test_an_error_report_carries_the_reference_as_a_tag():
    token = request_id._current.set('REF123456789')
    try:
        event = sentry_before_send({'message': 'x'}, {})
    finally:
        request_id._current.reset(token)
    assert event['tags']['request_id'] == 'REF123456789'


def test_an_error_report_outside_a_request_is_left_alone():
    assert sentry_before_send({'message': 'x'}, {}) == {'message': 'x'}


def test_the_reporter_is_given_the_hook():
    import ssms_django.settings as site
    source = open(site.__file__, encoding='utf-8').read()
    assert 'before_send=sentry_before_send' in source


@pytest.mark.django_db
def test_a_crash_in_a_request_is_logged_with_its_reference(caplog):
    from rest_framework.test import APIClient

    from tests.factories import UserFactory
    client = APIClient(raise_request_exception=False)
    client.force_authenticate(user=UserFactory())
    with mock.patch('users.views.ProfileView.get', side_effect=RuntimeError('boom')), caplog.at_level(logging.ERROR):
        response = client.get('/api/auth/me')
    assert response.status_code == 500
    refs = {getattr(r, 'request_id', None) for r in caplog.records}
    assert response['X-Request-ID'] in refs
