"""A temporary route that says, for each forwarding header, whether the caller's own address is in it and whether a forged one survived.

It is used once, to learn from the live site which header can be trusted for a visitor's address, and then removed. It never prints an
address: only counts and yes or no, and the yes or no is about the address the caller named in `me`, so a caller learns nothing but
about their own request.
"""
import json

import pytest
from django.test import RequestFactory

from core.proxy_check import proxy_check

URL = '/api/health/proxy'


def call(me=None, **headers):
    extra = {'REMOTE_ADDR': '10.0.0.1', **headers}
    request = RequestFactory().get(URL + (f'?me={me}' if me else ''), **extra)
    return json.loads(proxy_check(request).content)


def test_it_says_for_each_header_whether_the_address_named_is_in_it():
    body = call(me='198.51.100.7', HTTP_X_FORWARDED_FOR='198.51.100.7, 162.158.1.1, 10.0.0.9', HTTP_CF_CONNECTING_IP='198.51.100.7')
    xff = body['headers']['x-forwarded-for']
    assert xff == {'entries': 3, 'hasMe': True, 'firstIsMe': True, 'lastIsMe': False, 'hasForged': False}
    assert body['headers']['cf-connecting-ip']['lastIsMe'] is True
    assert body['headers']['x-vercel-forwarded-for'] is None


def test_it_says_when_a_forged_address_from_the_documentation_range_got_through():
    body = call(me='198.51.100.7', HTTP_X_FORWARDED_FOR='203.0.113.9, 198.51.100.7', HTTP_X_VERCEL_FORWARDED_FOR='203.0.113.9')
    assert body['headers']['x-forwarded-for']['hasForged'] is True
    assert body['headers']['x-vercel-forwarded-for'] == {'entries': 1, 'hasMe': False, 'firstIsMe': False, 'lastIsMe': False, 'hasForged': True}


def test_it_reads_the_forwarded_header_of_the_standard_form():
    body = call(me='198.51.100.7', HTTP_FORWARDED='for=198.51.100.7;proto=https;host=example.rw, for="203.0.113.5"')
    assert body['headers']['forwarded']['hasMe'] is True and body['headers']['forwarded']['hasForged'] is True


def test_it_never_prints_an_address():
    body = json.dumps(call(
        me='198.51.100.7', HTTP_X_FORWARDED_FOR='198.51.100.7, 203.0.113.9, 162.158.1.1', HTTP_X_VERCEL_FORWARDED_FOR='198.51.100.7',
        HTTP_CF_CONNECTING_IP='198.51.100.7', HTTP_FORWARDED='for=198.51.100.7',
    ))
    for fragment in ('198.51.100', '203.0.113', '162.158', '10.0.0'):
        assert fragment not in body


def test_a_name_that_is_not_an_address_is_ignored():
    body = call(me='not-an-address', HTTP_X_FORWARDED_FOR='198.51.100.7')
    assert body['headers']['x-forwarded-for']['hasMe'] is False
    assert body['chosen'] == {'isMe': False, 'isForged': False}


def test_it_says_whether_the_address_the_api_counts_is_the_caller_or_a_forged_one(settings):
    settings.TRUSTED_PROXY_COUNT = 2
    settings.EDGE_SECRET = ''
    body = call(me='198.51.100.7', HTTP_X_FORWARDED_FOR='203.0.113.9, 198.51.100.7, 162.158.1.1, 10.0.0.9')
    assert body['chosen'] == {'isMe': False, 'isForged': True}
    assert body['trustedProxyCount'] == 2 and body['secretSet'] is False


def test_it_says_whether_the_secret_arrived_and_matched_but_never_the_secret(settings):
    settings.EDGE_SECRET = 'a-long-secret-the-site-and-the-api-share-0123456789'
    body = call(HTTP_X_SSMS_EDGE='a-long-secret-the-site-and-the-api-share-0123456789')
    assert body['secretSet'] is True and body['secretSent'] is True and body['secretMatches'] is True
    wrong = call(HTTP_X_SSMS_EDGE='a-guess')
    assert wrong['secretSent'] is True and wrong['secretMatches'] is False
    assert 'a-long-secret' not in json.dumps(body)


@pytest.mark.django_db
def test_the_route_is_open_and_answers_json(client):
    response = client.get(URL + '?me=198.51.100.7', HTTP_X_FORWARDED_FOR='198.51.100.7')
    assert response.status_code == 200
    assert 'headers' in response.json()
