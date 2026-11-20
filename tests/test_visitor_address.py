"""The visitor's address, as the live chain really arrives.

Read from the live API on 2026-11-20 (kinds only, no addresses). Through the site the chain is the visitor, Vercel's
address, a Cloudflare address, then a private address of the host's balancer. Straight at the host it is the visitor, a
Cloudflare address, then the private one. Counting from the right found Cloudflare in both cases, so every log and every
limit by address named Cloudflare. The documentation ranges below stand in for the public addresses.
"""
import pytest
from django.test import RequestFactory

from core.net import get_client_ip, is_infrastructure
from core.throttles import AnonRateThrottle, DeviceKeyThrottle, UserRateThrottle

VISITOR = '198.51.100.7'
VERCEL = '203.0.113.50'
CLOUDFLARE = '162.158.1.1'
BALANCER = '10.20.30.40'

THROUGH_THE_SITE = f'{VISITOR}, {VERCEL}, {CLOUDFLARE}, {BALANCER}'
STRAIGHT_AT_THE_HOST = f'{VISITOR}, {CLOUDFLARE}, {BALANCER}'


def request_with(forwarded=None, remote=BALANCER):
    extra = {'REMOTE_ADDR': remote}
    if forwarded is not None:
        extra['HTTP_X_FORWARDED_FOR'] = forwarded
    return RequestFactory().get('/x', **extra)


@pytest.fixture(autouse=True)
def live_count(settings):
    settings.TRUSTED_PROXY_COUNT = 2


def test_through_the_site_the_visitor_is_found():
    assert get_client_ip(request_with(THROUGH_THE_SITE)) == VISITOR


def test_straight_at_the_host_the_visitor_is_found():
    assert get_client_ip(request_with(STRAIGHT_AT_THE_HOST)) == VISITOR


def test_a_chain_of_only_known_hops_falls_back_to_the_connecting_address():
    assert get_client_ip(request_with(f'{CLOUDFLARE}, {BALANCER}')) == BALANCER


def test_without_the_header_the_connecting_address_is_used():
    assert get_client_ip(request_with(None, remote='192.0.2.5')) == '192.0.2.5'


def test_with_no_trusted_proxy_the_header_is_ignored(settings):
    settings.TRUSTED_PROXY_COUNT = 0
    assert get_client_ip(request_with(THROUGH_THE_SITE, remote='192.0.2.5')) == '192.0.2.5'


def test_known_hops_are_named_by_range():
    assert is_infrastructure(CLOUDFLARE)
    assert is_infrastructure('2606:4700::1')
    assert is_infrastructure(BALANCER)
    assert not is_infrastructure(VISITOR)
    assert not is_infrastructure('not an address')


@pytest.mark.parametrize('throttle', [AnonRateThrottle, UserRateThrottle, DeviceKeyThrottle])
@pytest.mark.parametrize('chain', [THROUGH_THE_SITE, STRAIGHT_AT_THE_HOST])
def test_every_limit_counts_the_visitor_not_cloudflare(throttle, chain):
    assert throttle().get_ident(request_with(chain)) == VISITOR
