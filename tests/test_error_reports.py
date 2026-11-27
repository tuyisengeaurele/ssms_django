"""What an error report may carry. What people type stays out of it: a message above all.

The error reporter sends the contents of the failing request unless told not to, even with personal data switched off.
"""
import asyncio
import json

import httpx
import pytest
import sentry_sdk
from sentry_sdk.transport import Transport

from core.logging import sentry_options
from ssms_django.asgi import application
from tests.factories import CooperativeFactory, UserFactory
from tests.mfa_helpers import client_with, session_for

SECRET = 'Umurwayi wanjye aririrwa arira ejo'   # words nobody else may see
URL = 'https://ssms.example.test'


def report(path, **more):
    """An error report as the reporter builds it, with the words in every place they can land."""
    return {
        'request': {'url': f'{URL}{path}', 'method': 'POST', 'data': {'body': SECRET}, 'headers': {'Host': 'ssms'}},
        'exception': {'values': [{'type': 'RuntimeError', 'stacktrace': {'frames': [{'function': 'post', 'vars': {'words': SECRET}}]}}]},
        'threads': {'values': [{'stacktrace': {'frames': [{'function': 'run', 'vars': {'body': SECRET}}]}}]},
        'breadcrumbs': {'values': [{'category': 'log', 'message': SECRET}]},
        **more,
    }


def cleaned(event, step='before_send'):
    return sentry_options()[step](event, {})


@pytest.mark.parametrize('step', ['before_send', 'before_send_transaction'])
@pytest.mark.parametrize('path', ['/api/messages/send', '/api/messages/updates', '/api/messages/conversations/abc'])
def test_nothing_typed_is_left_in_a_report_about_messages(step, path):
    event = cleaned(report(path), step)
    assert SECRET not in json.dumps(event)
    assert event['request']['method'] == 'POST' and event['exception']['values'][0]['type'] == 'RuntimeError'
    assert event['exception']['values'][0]['stacktrace']['frames'][0]['function'] == 'post'
    assert 'breadcrumbs' not in event


def test_a_report_named_only_by_its_route_is_treated_the_same():
    event = report('/api/messages/send', transaction='/api/messages/send')
    del event['request']['url']
    assert SECRET not in json.dumps(cleaned(event))


@pytest.mark.parametrize('path', ['/api/contact', '/api/alerts/abc/comments', '/api/auth/login'])
def test_for_every_other_route_the_request_contents_go_and_the_rest_stays_to_find_the_fault_with(path):
    event = cleaned(report(path))
    assert 'data' not in event['request']
    assert event['exception']['values'][0]['stacktrace']['frames'][0]['vars'] == {'words': SECRET}
    assert event['breadcrumbs']['values'][0]['message'] == SECRET


@pytest.mark.parametrize('event', [{}, {'request': {}}, {'exception': {'values': [{}]}}, {'request': {'url': None}}, {'breadcrumbs': []}])
def test_a_report_of_any_shape_gets_through(event):
    assert cleaned(dict(event)) is not None


def test_the_reference_of_the_request_is_still_on_it(monkeypatch):
    monkeypatch.setattr('core.logging.current_request_id', lambda: 'ref-12345678')
    assert cleaned(report('/api/messages/send'))['tags']['request_id'] == 'ref-12345678'


def test_the_settings_give_the_reporter_these_rules():
    from pathlib import Path

    source = (Path(__file__).resolve().parent.parent / 'ssms_django' / 'settings.py').read_text(encoding='utf-8')
    assert '**sentry_options()' in source
    options = sentry_options()
    assert options['send_default_pii'] is False and options['before_send'] is options['before_send_transaction']


class Catch(Transport):
    """Keeps what would have been sent."""

    def __init__(self):
        super().__init__()
        self.sent = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.type in ('event', 'transaction'):
                self.sent.append(item.payload.json)


@pytest.fixture
def reporter():
    catch = Catch()
    sentry_sdk.init(dsn='https://public@reports.invalid/1', transport=catch, traces_sample_rate=1.0, **sentry_options())
    yield catch
    # Off again for every test after this one.
    sentry_sdk.get_global_scope().set_client(None)


# Through the application the live server runs. Django's test client takes another path, which leaves out the address.
@pytest.mark.django_db(transaction=True)
def test_a_real_failing_send_reports_the_fault_and_none_of_the_words(reporter, monkeypatch):
    farmer = UserFactory(cooperative=CooperativeFactory())

    def fail(*args, **kwargs):
        raise RuntimeError('the database went away')

    monkeypatch.setattr('messaging.views.save_message', fail)
    token = client_with(farmer, session_for(farmer))._credentials['HTTP_AUTHORIZATION']

    async def send():
        transport = httpx.ASGITransport(app=application, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url='http://testserver') as browser:
            body = {'body': SECRET, 'clientId': 'abcdef12-0000'}
            return await browser.post('/api/messages/send', json=body, headers={'Authorization': token})

    assert asyncio.run(send()).status_code == 500

    errors = [event for event in reporter.sent if event.get('exception')]
    timings = [event for event in reporter.sent if event.get('type') == 'transaction']
    assert errors and timings, 'the reporter did not see the request, so this test proves nothing'
    assert errors[0]['request']['url'].endswith('/api/messages/send')
    assert errors[0]['exception']['values'][-1]['type'] == 'RuntimeError'
    assert SECRET not in json.dumps(reporter.sent)
