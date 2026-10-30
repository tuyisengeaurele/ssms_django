"""The pure checks behind scripts/smoke_deploy.py. The script itself talks to a live address and is run by hand."""
from scripts.smoke_deploy import cookie_problems, cors_problems, header_problems

GOOD_HEADERS = {
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
}


def test_a_complete_set_of_headers_has_no_problems():
    assert header_problems(GOOD_HEADERS, https=True) == []


def test_every_missing_header_is_named():
    headers = {k: v for k, v in GOOD_HEADERS.items() if k not in ('x-frame-options', 'content-security-policy')}
    assert header_problems(headers, https=True) == ['missing header x-frame-options', 'missing header content-security-policy']


def test_hsts_is_only_expected_over_https():
    headers = {k: v for k, v in GOOD_HEADERS.items() if k != 'strict-transport-security'}
    assert header_problems(headers, https=False) == []
    assert header_problems(headers, https=True) == ['missing header strict-transport-security']


def test_a_short_hsts_lifetime_is_a_problem():
    headers = dict(GOOD_HEADERS, **{'strict-transport-security': 'max-age=300'})
    assert header_problems(headers, https=True) == ['strict-transport-security lasts less than a year']


def test_header_names_are_not_case_sensitive():
    shouting = {name.upper(): value for name, value in GOOD_HEADERS.items()}
    assert header_problems(shouting, https=True) == []


REFRESH = 'ssms_refresh=abc; HttpOnly; Max-Age=604800; Path=/; SameSite=Lax; Secure'


def test_a_refresh_cookie_with_every_flag_has_no_problems():
    assert cookie_problems(REFRESH, https=True) == []


def test_a_cookie_scripts_can_read_is_a_problem():
    assert 'cookie is not HttpOnly' in cookie_problems(REFRESH.replace('HttpOnly; ', ''), https=True)


def test_a_cookie_without_secure_is_a_problem_over_https_only():
    insecure = REFRESH.replace('; Secure', '')
    assert 'cookie is not Secure' in cookie_problems(insecure, https=True)
    assert cookie_problems(insecure, https=False) == []


def test_a_cookie_without_samesite_is_a_problem():
    assert 'cookie has no SameSite' in cookie_problems(REFRESH.replace('; SameSite=Lax', ''), https=True)


def test_a_lax_cookie_is_sent_only_to_the_same_site():
    problems = cookie_problems(REFRESH, https=True, site='https://app.example.rw', api='https://ssms-api.onrender.com')
    assert problems == ['SameSite=Lax cookie will not be sent: the site and the API are on different sites']


def test_two_subdomains_of_one_domain_are_the_same_site():
    assert cookie_problems(REFRESH, https=True, site='https://app.example.rw', api='https://api.example.rw') == []


def test_two_apps_on_a_shared_host_are_not_the_same_site():
    problems = cookie_problems(REFRESH, https=True, site='https://ssms.vercel.app', api='https://ssms-api.vercel.app')
    assert len(problems) == 1


def test_a_site_that_proxies_the_api_on_its_own_address_is_the_same_site():
    assert cookie_problems(REFRESH, https=True, site='https://app.example.rw', api='https://app.example.rw') == []


def test_an_allowed_origin_is_echoed_and_credentials_are_allowed():
    sent = {'access-control-allow-origin': 'https://app.example.rw', 'access-control-allow-credentials': 'true'}
    assert cors_problems(sent, allowed='https://app.example.rw', stranger_sent={}) == []


def test_the_site_origin_being_refused_is_a_problem():
    assert 'the site origin is not allowed by CORS' in cors_problems({}, allowed='https://app.example.rw', stranger_sent={})


def test_credentials_must_be_allowed_for_the_refresh_cookie():
    sent = {'access-control-allow-origin': 'https://app.example.rw'}
    assert 'CORS does not allow credentials' in cors_problems(sent, allowed='https://app.example.rw', stranger_sent={})


def test_a_stranger_origin_must_not_be_allowed():
    stranger = {'access-control-allow-origin': 'https://evil.example'}
    assert 'a stranger origin is allowed by CORS' in cors_problems(
        {'access-control-allow-origin': 'https://app.example.rw', 'access-control-allow-credentials': 'true'},
        allowed='https://app.example.rw', stranger_sent=stranger,
    )
    star = {'access-control-allow-origin': '*'}
    assert 'a stranger origin is allowed by CORS' in cors_problems(
        {'access-control-allow-origin': 'https://app.example.rw', 'access-control-allow-credentials': 'true'},
        allowed='https://app.example.rw', stranger_sent=star,
    )
