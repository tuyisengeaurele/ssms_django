"""Browsers send a short report when the content security policy blocks something. The API keeps one line of it.

The endpoint is open to anyone, because a browser sends the report without signing in. So it must stay small and harmless:
it keeps no query string (it can hold a token), ignores noise from browser extensions, ignores bodies that are too big or
not JSON, stores a repeated report once, and answers 204 to everything.
"""
import json

import pytest
from django.conf import settings as django_settings

from logs.models import SecurityEvent
from logs.security import KINDS

pytestmark = pytest.mark.django_db

URL = '/api/csp-report'
LEGACY = {'csp-report': {
    'document-uri': 'https://ssms-django.vercel.app/farmer?token=secret&x=1',
    'violated-directive': "img-src 'self' data:",
    'blocked-uri': 'https://tracker.example/pixel.gif?id=42',
}}
MODERN = [{'type': 'csp-violation', 'body': {
    'documentURL': 'https://ssms-django.vercel.app/lot/abc123',
    'effectiveDirective': 'script-src',
    'blockedURL': 'inline',
}}]


def send(client, payload, content_type):
    return client.generic('POST', URL, json.dumps(payload), content_type=content_type)


def test_the_kind_has_plain_words_and_the_allowance_is_the_one_we_decided():
    assert KINDS['csp_violation']
    assert django_settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['csp'] == '30/minute'


def test_a_legacy_report_is_stored_without_the_query_strings(api_client):
    assert send(api_client, LEGACY, 'application/csp-report').status_code == 204
    event = SecurityEvent.objects.get(kind='csp_violation')
    assert event.detail == 'img-src blocked https://tracker.example on /farmer'
    assert 'secret' not in event.detail and '42' not in event.detail and 'pixel' not in event.detail


def test_a_modern_report_is_stored(api_client):
    assert send(api_client, MODERN, 'application/reports+json').status_code == 204
    assert SecurityEvent.objects.get(kind='csp_violation').detail == 'script-src blocked inline on /lot/abc123'


def test_a_plain_json_report_is_accepted_too(api_client):
    assert send(api_client, LEGACY, 'application/json').status_code == 204
    assert SecurityEvent.objects.filter(kind='csp_violation').count() == 1


@pytest.mark.parametrize('blocked', [
    'chrome-extension://abc/x.js', 'moz-extension://abc/x.js', 'safari-extension://abc/x.js',
    'safari-web-extension://abc/x.js', 'about',
])
def test_a_browser_extension_is_not_news(api_client, blocked):
    payload = {'csp-report': {**LEGACY['csp-report'], 'blocked-uri': blocked}}
    assert send(api_client, payload, 'application/csp-report').status_code == 204
    assert SecurityEvent.objects.count() == 0


def test_the_same_report_twice_is_stored_once(api_client):
    send(api_client, LEGACY, 'application/csp-report')
    send(api_client, LEGACY, 'application/csp-report')
    assert SecurityEvent.objects.filter(kind='csp_violation').count() == 1


def test_a_different_report_is_stored_too(api_client):
    send(api_client, LEGACY, 'application/csp-report')
    other = {'csp-report': {**LEGACY['csp-report'], 'blocked-uri': 'https://other.example/x.png'}}
    send(api_client, other, 'application/csp-report')
    assert SecurityEvent.objects.filter(kind='csp_violation').count() == 2


def test_garbage_and_oversize_bodies_answer_204_and_store_nothing(api_client):
    assert api_client.generic('POST', URL, 'not json', content_type='application/csp-report').status_code == 204
    assert api_client.generic('POST', URL, '', content_type='application/csp-report').status_code == 204
    assert send(api_client, {'csp-report': {'blocked-uri': 'x' * 20000}}, 'application/csp-report').status_code == 204
    assert send(api_client, ['a', 1, None], 'application/reports+json').status_code == 204
    assert SecurityEvent.objects.count() == 0


def test_a_long_page_address_is_cut_to_the_column_size(api_client):
    payload = {'csp-report': {**LEGACY['csp-report'], 'document-uri': 'https://ssms-django.vercel.app/' + 'a' * 3000}}
    assert send(api_client, payload, 'application/csp-report').status_code == 204
    assert len(SecurityEvent.objects.get(kind='csp_violation').detail) <= 300


def test_the_address_of_the_visitor_is_kept_for_the_log_and_nothing_else_about_them(api_client):
    send(api_client, LEGACY, 'application/csp-report')
    event = SecurityEvent.objects.get(kind='csp_violation')
    assert event.user_id is None and event.user_email == ''


def test_other_methods_are_not_allowed(api_client):
    assert api_client.get(URL).status_code == 405


@pytest.mark.throttle
def test_the_thirty_first_report_in_a_minute_is_refused(api_client):
    codes = []
    for number in range(31):
        payload = {'csp-report': {**LEGACY['csp-report'], 'blocked-uri': f'https://host{number}.example/x.png'}}
        codes.append(send(api_client, payload, 'application/csp-report').status_code)
    assert codes[:30] == [204] * 30
    assert codes[30] == 429
