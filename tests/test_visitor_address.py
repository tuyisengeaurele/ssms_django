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
VEND = VERCEL    # the address Cloudflare saw when the site called, so Vercel's own

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


# ── with the shared secret: only the site can say who the visitor is ────────────────────────
#
# Measured on the live API on 2026-11-20: a visitor who sent an X-Forwarded-For of their own through the site, or straight at the host,
# was counted as that address, and so slipped past every limit by address. The site now sends a secret header (set by Vercel, which
# replaces any value a visitor sends). A request with it is counted by the address Vercel says connected. A request without it is
# counted by the last address that is not the hosting path: the one that connected to Cloudflare, which no header can change.

SECRET = 'a-long-secret-the-site-and-the-api-share-0123456789'
FORGED = '203.0.113.99'


def strict_request(forwarded=None, *, secret=SECRET, vercel=None, remote=BALANCER):
    extra = {'REMOTE_ADDR': remote}
    if forwarded is not None:
        extra['HTTP_X_FORWARDED_FOR'] = forwarded
    if secret is not None:
        extra['HTTP_X_SSMS_EDGE'] = secret
    if vercel is not None:
        extra['HTTP_X_SSMS_CLIENT_IP'] = vercel
    return RequestFactory().get('/x', **extra)


@pytest.fixture
def strict(settings):
    settings.EDGE_SECRET = SECRET


def test_a_request_from_the_site_is_counted_by_the_address_the_site_reports(strict):
    request = strict_request(THROUGH_THE_SITE, vercel=VISITOR)
    assert get_client_ip(request) == VISITOR


def test_a_visitor_who_writes_their_own_forwarded_for_through_the_site_is_still_counted_as_themselves(strict):
    request = strict_request(f'{FORGED}, {VEND}, {CLOUDFLARE}, {BALANCER}', vercel=VISITOR)
    assert get_client_ip(request) == VISITOR


def test_a_caller_straight_at_the_host_is_counted_by_the_address_that_reached_cloudflare(strict):
    assert get_client_ip(strict_request(STRAIGHT_AT_THE_HOST, secret=None)) == VISITOR


def test_a_caller_straight_at_the_host_cannot_choose_their_address_by_writing_extra_entries(strict):
    forged = f'{FORGED}, {VISITOR}, {CLOUDFLARE}, {BALANCER}'
    assert get_client_ip(strict_request(forged, secret=None)) == VISITOR
    many = f'1.1.1.1, 2.2.2.2, {FORGED}, {VISITOR}, {CLOUDFLARE}, {BALANCER}'
    assert get_client_ip(strict_request(many, secret=None)) == VISITOR


def test_a_caller_cannot_claim_to_be_the_site_without_the_secret(strict):
    request = strict_request(STRAIGHT_AT_THE_HOST, secret='a-guess', vercel=FORGED)
    assert get_client_ip(request) == VISITOR


def test_a_caller_who_sends_the_address_header_without_the_secret_is_not_believed(strict):
    assert get_client_ip(strict_request(STRAIGHT_AT_THE_HOST, secret=None, vercel=FORGED)) == VISITOR


def test_the_secret_is_compared_exactly_and_odd_bytes_do_not_break_it(strict):
    for sent in ('', SECRET + 'x', SECRET[:-1], SECRET.upper(), 'é' * 40):
        assert get_client_ip(strict_request(STRAIGHT_AT_THE_HOST, secret=sent, vercel=FORGED)) == VISITOR


def test_when_the_site_says_nothing_usable_the_request_falls_back_to_the_address_cloudflare_saw(strict):
    for vercel in (None, '', 'not an address', ',,,'):
        assert get_client_ip(strict_request(THROUGH_THE_SITE, vercel=vercel)) == VEND


def test_the_first_address_is_taken_when_the_site_reports_several(strict):
    assert get_client_ip(strict_request(THROUGH_THE_SITE, vercel=f'{VISITOR}, {FORGED}')) == VISITOR


def test_an_address_in_the_header_may_be_ipv6(strict):
    assert get_client_ip(strict_request(THROUGH_THE_SITE, vercel='2001:db8::7')) == '2001:db8::7'


def test_with_the_secret_set_and_no_forwarded_chain_the_connecting_address_is_used(strict):
    assert get_client_ip(strict_request(None, secret=None, remote='192.0.2.5')) == '192.0.2.5'


def test_with_no_trusted_proxy_nothing_is_believed_even_with_the_secret(strict, settings):
    settings.TRUSTED_PROXY_COUNT = 0
    assert get_client_ip(strict_request(THROUGH_THE_SITE, vercel=VISITOR, remote='192.0.2.5')) == '192.0.2.5'


def test_without_the_secret_set_the_older_rule_still_holds(settings):
    settings.EDGE_SECRET = ''
    assert get_client_ip(strict_request(THROUGH_THE_SITE, secret=SECRET, vercel=FORGED)) == VISITOR


@pytest.mark.parametrize('throttle', [AnonRateThrottle, UserRateThrottle, DeviceKeyThrottle])
def test_every_limit_counts_a_forger_as_the_address_that_really_connected(strict, throttle):
    forged = f'{FORGED}, {VISITOR}, {CLOUDFLARE}, {BALANCER}'
    assert throttle().get_ident(strict_request(forged, secret=None)) == VISITOR


# ── the deploy check ────────────────────────────────────────────────────────────────────────

def test_a_live_site_without_the_secret_is_warned_about(settings):
    from ssms_django.checks import check_edge_secret
    settings.DEBUG, settings.EDGE_SECRET = False, ''
    found = check_edge_secret(app_configs=None)
    assert [item.id for item in found] == ['ssms.W002']


def test_a_live_site_with_the_secret_is_not_warned_and_neither_is_a_laptop(settings):
    from ssms_django.checks import check_edge_secret
    settings.DEBUG, settings.EDGE_SECRET = False, SECRET
    assert check_edge_secret(app_configs=None) == []
    settings.DEBUG, settings.EDGE_SECRET = True, ''
    assert check_edge_secret(app_configs=None) == []


def test_a_short_secret_is_refused_because_it_can_be_guessed(settings):
    from ssms_django.checks import check_edge_secret
    settings.DEBUG, settings.EDGE_SECRET = False, 'short'
    assert [item.id for item in check_edge_secret(app_configs=None)] == ['ssms.W003']


# ── which header the site's word about the visitor is read from ─────────────────────────────
#
# Measured on 2026-11-21: through the website, a visitor's own X-Vercel-Forwarded-For (and, on some requests, X-Forwarded-For) reaches the API
# as written, because Vercel does not always replace it. The secret alone only proves a request passed through Vercel, so the address header
# has to be one that nobody but the website's own code sets, and that code has to replace what a visitor sends.

def test_the_header_the_site_reports_the_visitor_in_is_one_only_our_own_code_sets(settings):
    from django.conf import settings as default
    assert default.EDGE_CLIENT_IP_HEADER == 'X-SSMS-Client-IP'


def test_a_visitor_who_forges_the_vercel_header_through_the_site_is_not_believed(strict):
    request = strict_request(THROUGH_THE_SITE, vercel=None)
    request.META['HTTP_X_VERCEL_FORWARDED_FOR'] = FORGED
    assert get_client_ip(request) == VEND      # the address Cloudflare saw, not the forged one


def test_a_forged_forwarded_for_is_never_what_the_request_is_counted_by_once_the_secret_is_set(strict):
    request = strict_request(f'{FORGED}, {VEND}, {CLOUDFLARE}, {BALANCER}', vercel=None)
    assert get_client_ip(request) == VEND
