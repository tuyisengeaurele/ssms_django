"""A small public endpoint that says what shape the forwarded headers arrive in, so the proxy count can be set from evidence.

The live API logs a Cloudflare address for every visitor, whatever TRUSTED_PROXY_COUNT is. To choose the right count the chain has to
be seen: how many entries, which of them are Cloudflare's, which headers exist. This answers that, and never says an address: only
what kind each one is.
"""
import pytest
from django.test import Client, override_settings

from core.proxy_shape import classify

URL = '/api/health/proxy'
VISITOR = '41.186.139.14'
EDGE_OF_THE_HOST = '76.76.21.21'
CLOUDFLARE = '172.68.247.32'


@pytest.mark.parametrize('address', ['104.23.239.121', '172.68.247.32', '162.158.95.129', '172.70.250.36', '172.71.150.56', '2606:4700::1111', '131.0.72.5'])
def test_cloudflare_addresses_are_recognised(address):
    assert classify(address) == 'cloudflare'


@pytest.mark.parametrize('address', ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '::1', 'fd00::1'])
def test_private_addresses_are_recognised(address):
    assert classify(address) == 'private'


@pytest.mark.parametrize('address', [VISITOR, EDGE_OF_THE_HOST, '8.8.8.8', '2a00:1450:4001::1'])
def test_other_public_addresses_are_just_public(address):
    assert classify(address) == 'public'


@pytest.mark.parametrize('text', ['', 'unknown', 'not an address', '999.1.1.1'])
def test_what_is_not_an_address_is_unknown(text):
    assert classify(text) == 'unknown'


def ask(forwarded=None, remote='10.0.0.5', **headers):
    extra = {'REMOTE_ADDR': remote, **headers}
    if forwarded is not None:
        extra['HTTP_X_FORWARDED_FOR'] = forwarded
    return Client().get(URL, **extra)


def rest(count):
    return override_settings(REST_FRAMEWORK={'NUM_PROXIES': count}, TRUSTED_PROXY_COUNT=count)


def test_it_says_how_many_entries_arrived_and_what_each_is():
    with rest(2):
        data = ask(f'{VISITOR}, {EDGE_OF_THE_HOST}, {CLOUDFLARE}').json()
    assert data['forwardedFor'] == ['public', 'public', 'cloudflare']
    assert data['trustedProxyCount'] == 2


def test_it_says_what_kind_of_address_the_app_would_use_with_the_count_it_has():
    chain = f'{VISITOR}, {EDGE_OF_THE_HOST}, {CLOUDFLARE}'
    with rest(1):
        assert ask(chain).json()['chosen'] == 'cloudflare'       # the last entry: what the live site does today
    with rest(2):
        assert ask(chain).json()['chosen'] == 'public'           # the one before it
    with rest(3):
        assert ask(chain).json()['chosen'] == 'public'           # the first, the visitor


def test_a_chain_shorter_than_the_count_uses_the_first_entry_as_the_app_does():
    with rest(5):
        assert ask(CLOUDFLARE).json()['chosen'] == 'cloudflare'


def test_without_a_forwarded_chain_it_reports_the_connecting_address():
    with rest(2):
        data = ask(None, remote='10.9.8.7').json()
    assert data['forwardedFor'] == []
    assert data['chosen'] == 'private'
    assert data['remoteAddr'] == 'private'


def test_it_lists_which_of_the_interesting_headers_are_present_and_not_their_values():
    data = ask(
        f'{VISITOR}, {CLOUDFLARE}', HTTP_CF_CONNECTING_IP=VISITOR, HTTP_X_REAL_IP=VISITOR, HTTP_X_VERCEL_FORWARDED_FOR=VISITOR,
        HTTP_X_UNRELATED='x',
    ).json()
    assert data['headers'] == ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'x-vercel-forwarded-for']


def test_it_never_says_an_address():
    with rest(2):
        response = ask(f'{VISITOR}, {EDGE_OF_THE_HOST}, {CLOUDFLARE}', remote='10.20.30.40', HTTP_CF_CONNECTING_IP=VISITOR)
    text = response.content.decode()
    for secret in (VISITOR, EDGE_OF_THE_HOST, CLOUDFLARE, '10.20.30.40'):
        assert secret not in text


def test_a_garbled_chain_does_not_break_it():
    with rest(2):
        data = ask(',, , not-an-address, 1.2.3.4').json()
    assert data['forwardedFor'] == ['unknown', 'unknown', 'unknown', 'unknown', 'public']


def test_it_needs_no_sign_in():
    assert ask(VISITOR).status_code == 200
