"""The audit log records what changed in a field, never a secret, and says which request and device it came from."""
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from rest_framework.test import APIRequestFactory

from audit_log.changes import HIDDEN, LONGEST, build_changes, snapshot
from audit_log.models import AuditLog
from audit_log.utils import log_action
from tests.factories import BatchFactory, FarmFactory, UserFactory
from users.models import UserSession

# ── build_changes ───────────────────────────────────────────────────────────────────────────


def test_only_the_fields_that_changed_are_listed():
    before = {'name': 'Gisenyi', 'location': 'Rubavu', 'notes': ''}
    after = {'name': 'Gisenyi Two', 'location': 'Rubavu', 'notes': ''}
    assert build_changes(before, after) == {'name': {'from': 'Gisenyi', 'to': 'Gisenyi Two'}}


def test_nothing_changed_gives_an_empty_answer():
    assert build_changes({'a': 1}, {'a': 1}) == {}


def test_a_field_only_one_side_has_counts_as_changed():
    assert build_changes({'a': 1}, {'a': 1, 'b': 2}) == {'b': {'from': None, 'to': 2}}
    assert build_changes({'a': 1, 'b': 2}, {'a': 1}) == {'b': {'from': 2, 'to': None}}


@pytest.mark.parametrize('field', ['password', 'new_password', 'access_token', 'refresh', 'api_key', 'client_secret', 'share_token', 'Authorization', 'cookie'])
def test_a_secret_is_never_written_down_but_the_change_is_noted(field):
    changes = build_changes({field: 'old-value'}, {field: 'new-value'})
    assert changes == {field: {'from': HIDDEN, 'to': HIDDEN}}
    assert 'value' not in str(changes)


def test_a_secret_that_did_not_change_is_not_mentioned():
    assert build_changes({'password': 'same'}, {'password': 'same'}) == {}


def test_long_text_is_cut():
    changes = build_changes({'notes': ''}, {'notes': 'x' * 5000})
    assert len(changes['notes']['to']) <= LONGEST + 1
    assert changes['notes']['to'].endswith('…')


def test_values_that_json_cannot_hold_become_text():
    changes = build_changes(
        {'when': datetime(2026, 1, 1, tzinfo=timezone.utc), 'weight': Decimal('1.5'), 'day': date(2026, 1, 1)},
        {'when': datetime(2026, 2, 1, tzinfo=timezone.utc), 'weight': Decimal('2.5'), 'day': date(2026, 2, 1)},
    )
    assert changes['weight'] == {'from': '1.5', 'to': '2.5'}
    assert changes['day'] == {'from': '2026-01-01', 'to': '2026-02-01'}
    assert changes['when']['to'].startswith('2026-02-01')


def test_a_related_object_is_named_by_its_key_not_dumped():
    owner = SimpleNamespace(pk='u1')
    changes = build_changes({'owner': None}, {'owner': owner})
    assert changes == {'owner': {'from': None, 'to': 'u1'}}


def test_a_number_and_the_same_number_as_text_are_different_values():
    assert build_changes({'n': 1}, {'n': '1'}) == {'n': {'from': 1, 'to': '1'}}


def test_a_snapshot_reads_the_named_fields_of_an_object():
    farm = SimpleNamespace(name='A', location='B', other='C')
    assert snapshot(farm, ['name', 'location']) == {'name': 'A', 'location': 'B'}


# ── log_action stores them ──────────────────────────────────────────────────────────────────

pytestmark = pytest.mark.django_db


def request_for(user, reference='REF123456789', session_id=None):
    request = APIRequestFactory().post('/x')
    request.user = user
    request.request_id = reference
    if session_id:
        request.session_id = session_id
    return request


def latest():
    return AuditLog.objects.order_by('-created_at', '-id').first()


def test_the_entry_keeps_what_changed():
    user = UserFactory()
    changes = {'name': {'from': 'a', 'to': 'b'}}
    log_action(request_for(user), 'UPDATE', 'Farm', 'f1', 'Updated', changes=changes)
    assert latest().changes == changes


def test_an_entry_with_no_changes_keeps_an_empty_set():
    log_action(request_for(UserFactory()), 'LOGIN', 'User', 'u1', 'Login')
    assert latest().changes == {}


def test_the_entry_keeps_the_reference_of_the_request(monkeypatch):
    from core import request_id
    token = request_id._current.set('REF123456789')
    try:
        log_action(request_for(UserFactory()), 'UPDATE', 'Farm', 'f1', 'Updated')
    finally:
        request_id._current.reset(token)
    assert latest().request_id == 'REF123456789'


def test_the_entry_names_the_device_when_the_request_has_a_session():
    user = UserFactory()
    from django.utils import timezone
    now = timezone.now()
    session = UserSession.objects.create(
        user=user, device_label='Chrome on Windows', last_used_at=now, last_activity_at=now, expires_at=now,
    )
    log_action(request_for(user, session_id=session.pk), 'UPDATE', 'Farm', 'f1', 'Updated')
    assert latest().device_label == 'Chrome on Windows'


def test_the_entry_has_no_device_when_there_is_no_session():
    log_action(request_for(UserFactory()), 'UPDATE', 'Farm', 'f1', 'Updated')
    assert latest().device_label == ''


def test_the_outcome_is_success_unless_said_otherwise():
    user = UserFactory()
    log_action(request_for(user), 'UPDATE', 'Farm', 'f1', 'Updated')
    assert latest().outcome == 'success'
    log_action(request_for(user), 'OTHER', 'User', '', 'Failed login', outcome='failure')
    assert latest().outcome == 'failure'


def test_the_owner_is_kept_as_a_field_as_well_as_in_the_text():
    admin, farmer = UserFactory(role='ADMIN'), UserFactory(role='FARMER')
    log_action(request_for(admin), 'UPDATE', 'Farm', 'f1', 'Updated', owner=farmer)
    assert latest().on_behalf_of_email == farmer.email
    log_action(request_for(farmer), 'UPDATE', 'Farm', 'f1', 'Updated', owner=farmer)
    assert latest().on_behalf_of_email == ''


# ── the views that record changes ───────────────────────────────────────────────────────────

def test_changing_a_farm_records_the_old_and_new_value(auth_client):
    farmer = UserFactory(role='FARMER')
    farm = FarmFactory(owner=farmer, name='Gisenyi Silk')
    response = auth_client(farmer).patch(f'/api/farms/{farm.pk}', {'name': 'Gisenyi Silk Two'}, format='json')
    assert response.status_code == 200
    assert latest().changes == {'name': {'from': 'Gisenyi Silk', 'to': 'Gisenyi Silk Two'}}


def test_changing_a_batch_records_what_changed(auth_client):
    farmer = UserFactory(role='FARMER')
    batch = BatchFactory(farm=FarmFactory(owner=farmer))
    response = auth_client(farmer).patch(f'/api/batches/{batch.pk}', {'notes': 'Moved the tray'}, format='json')
    assert response.status_code == 200, response.content
    assert latest().changes['notes']['to'] == 'Moved the tray'


def test_changing_a_safe_range_records_it(auth_client):
    from alerts.models import StageThreshold
    admin = UserFactory(role='ADMIN')
    row = StageThreshold.objects.first()
    if row is None:
        pytest.skip('no thresholds are seeded in this database')
    body = {'stage': row.stage, 'tempMin': row.temp_min, 'tempMax': row.temp_max + 1, 'humMin': row.hum_min, 'humMax': row.hum_max}
    response = auth_client(admin).put(f'/api/alerts/thresholds/{row.stage}', body, format='json')
    assert response.status_code == 200, response.content
    assert 'temp_max' in latest().changes


def test_the_audit_api_shows_the_new_fields(auth_client):
    admin = UserFactory(role='ADMIN')
    log_action(request_for(admin), 'UPDATE', 'Farm', 'f1', 'Updated', changes={'name': {'from': 'a', 'to': 'b'}})
    row = auth_client(admin).get('/api/admin/audit-log').json()['data'][0]
    assert {'requestId', 'changes', 'deviceLabel', 'onBehalfOfEmail', 'outcome'} <= set(row)
    assert row['changes'] == {'name': {'from': 'a', 'to': 'b'}}
