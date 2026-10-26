import pytest
from django.conf import settings as django_settings
from django.test import RequestFactory

from audit_log.models import AuditLog
from audit_log.utils import log_action
from core.net import get_client_ip
from tests.factories import UserFactory

LOGIN = '/api/auth/login'


def _request(xff=None, remote='10.0.0.1'):
    extra = {'REMOTE_ADDR': remote}
    if xff is not None:
        extra['HTTP_X_FORWARDED_FOR'] = xff
    return RequestFactory().get('/x', **extra)


@pytest.mark.django_db
@pytest.mark.throttle
def test_spoofed_xff_does_not_reset_login_throttle(api_client):
    def attempt(i):
        return api_client.post(
            LOGIN,
            # A different email each time, so only the address throttle can be what stops the 11th.
            {'email': f'nobody{i}@example.rw', 'password': 'Wrong1234'},
            format='json',
            HTTP_X_FORWARDED_FOR=f'198.51.100.{i}',
            REMOTE_ADDR='203.0.113.7',
        ).status_code

    codes = [attempt(i) for i in range(1, 12)]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_client_ip_ignores_xff_when_no_proxy_is_trusted(settings):
    settings.TRUSTED_PROXY_COUNT = 0
    assert get_client_ip(_request(xff='1.1.1.1, 2.2.2.2')) == '10.0.0.1'


def test_xff_trusted_one_proxy_uses_rightmost_hop(settings):
    settings.TRUSTED_PROXY_COUNT = 1
    assert get_client_ip(_request(xff='6.6.6.6, 2.2.2.2')) == '2.2.2.2'


def test_xff_trusted_two_proxies_uses_second_from_the_right(settings):
    settings.TRUSTED_PROXY_COUNT = 2
    assert get_client_ip(_request(xff='6.6.6.6, 3.3.3.3, 2.2.2.2')) == '3.3.3.3'


def test_missing_xff_falls_back_to_the_socket_address(settings):
    settings.TRUSTED_PROXY_COUNT = 1
    assert get_client_ip(_request()) == '10.0.0.1'


def test_short_xff_never_indexes_out_of_range(settings):
    settings.TRUSTED_PROXY_COUNT = 3
    assert get_client_ip(_request(xff='2.2.2.2')) == '2.2.2.2'


@pytest.mark.django_db
def test_audit_ip_is_not_spoofable(settings):
    settings.TRUSTED_PROXY_COUNT = 0
    user = UserFactory()
    log_action(_request(xff='6.6.6.6'), 'LOGIN', 'Auth', actor=user)
    assert AuditLog.objects.get().ip_address == '10.0.0.1'


def test_throttle_counters_live_in_the_database_cache():
    assert django_settings.CACHES['default']['BACKEND'].endswith('DatabaseCache')
    assert django_settings.REST_FRAMEWORK['NUM_PROXIES'] == django_settings.TRUSTED_PROXY_COUNT
