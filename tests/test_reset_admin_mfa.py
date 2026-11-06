"""The last resort for a lost phone: a command run with database access."""
from io import StringIO

import pytest
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from logs.models import SecurityEvent
from tests.factories import UserFactory
from tests.mfa_helpers import enable_factor, sign_in_admin
from users import mfa
from users.models import RecoveryCode

pytestmark = pytest.mark.django_db


def a_second_admin():
    target = UserFactory(role='ADMIN')
    secret = enable_factor(target)
    mfa.new_recovery_codes(target)
    return target, secret


def test_the_command_resets_an_admin_and_signs_them_out():
    target, secret = a_second_admin()
    client = APIClient()
    token = sign_in_admin(client, target, secret=secret).json()['data']['token']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    out = StringIO()
    call_command('reset_admin_mfa', target.email, stdout=out)
    assert mfa.is_enabled(target) is False and not RecoveryCode.objects.filter(user=target).exists()
    assert client.get('/api/auth/me').status_code == 401
    assert target.email in out.getvalue()


def test_the_command_writes_the_reset_down_without_sending_an_email():
    target, _ = a_second_admin()
    call_command('reset_admin_mfa', target.email, stdout=StringIO())
    assert SecurityEvent.objects.filter(kind='mfa_reset', user_id=target.pk, detail__icontains='command').exists()
    assert AuditLog.objects.filter(resource='User', resource_id=target.pk, detail__icontains='command line').exists()
    assert len(mail.outbox) == 0


def test_the_command_ignores_the_case_of_the_email():
    target, _ = a_second_admin()
    call_command('reset_admin_mfa', target.email.upper(), stdout=StringIO())
    assert mfa.is_enabled(target) is False


def test_the_command_refuses_an_unknown_email_a_farmer_and_an_admin_with_no_app():
    farmer = UserFactory(role='FARMER')
    no_app = UserFactory(role='ADMIN')
    for email in ('nobody@example.rw', farmer.email, no_app.email):
        with pytest.raises(CommandError):
            call_command('reset_admin_mfa', email, stdout=StringIO())
