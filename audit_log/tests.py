import logging
from unittest import mock

import pytest
from django.test import RequestFactory

from audit_log.models import AuditLog
from audit_log.utils import log_action
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def _request(user=None):
    request = RequestFactory().post('/api/anything', REMOTE_ADDR='10.1.2.3')
    if user is not None:
        request.user = user
    return request


def test_log_action_row_exists_immediately():
    user = UserFactory()
    log_action(_request(user), 'CREATE', 'Farm', resource_id='f1', detail='made a farm')

    row = AuditLog.objects.get()
    assert row.user_id == user.pk
    assert row.user_email == user.email
    assert (row.action, row.resource, row.resource_id) == ('CREATE', 'Farm', 'f1')
    assert row.ip_address == '10.1.2.3'


def test_log_action_records_the_given_actor_when_the_request_is_anonymous():
    user = UserFactory()
    log_action(_request(), 'LOGIN', 'Auth', actor=user)

    assert AuditLog.objects.get().user_id == user.pk


def test_log_action_failure_does_not_raise(caplog):
    user = UserFactory()
    with mock.patch.object(AuditLog.objects, 'create', side_effect=RuntimeError('db down')):
        with caplog.at_level(logging.ERROR):
            assert log_action(_request(user), 'UPDATE', 'Farm') is None

    assert AuditLog.objects.count() == 0
    assert any('audit' in record.getMessage().lower() for record in caplog.records)
