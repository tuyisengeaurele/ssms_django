"""GET /api/admin/logs/<stream>: the four log streams, for admins only, filterable, exportable, and every look is audited."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from logs.models import JobLog, RequestLog, SecurityEvent
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

STREAMS = ['audit', 'security', 'requests', 'jobs']


def url(stream, **query):
    from urllib.parse import urlencode
    return f'/api/admin/logs/{stream}' + (f'?{urlencode(query)}' if query else '')


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN')


@pytest.fixture
def client(admin):
    c = APIClient()
    c.force_authenticate(user=admin)
    return c


def at(model, days_ago, **fields):
    row = model.objects.create(**fields)
    model.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=days_ago))
    return row


@pytest.fixture
def rows(admin):
    farmer = UserFactory(role='FARMER', email='farmer@example.rw')
    return {
        'audit': [
            at(AuditLog, 1, user=farmer, user_email=farmer.email, action='UPDATE', resource='Farm', detail='Updated farm: Gisenyi', request_id='AAAA11112222', outcome='success'),
            at(AuditLog, 5, user=admin, user_email=admin.email, action='OTHER', resource='User', detail='Failed login: x@example.rw', request_id='BBBB33334444', outcome='failure'),
        ],
        'security': [
            at(SecurityEvent, 1, kind='login_ok', user=farmer, user_email=farmer.email, request_id='AAAA11112222', detail='Chrome on Windows'),
            at(SecurityEvent, 5, kind='lockout', detail='x@example.rw', request_id='BBBB33334444'),
        ],
        'requests': [
            at(RequestLog, 1, request_id='AAAA11112222', method='GET', route='api/farms', status=200, user=farmer, role='FARMER'),
            at(RequestLog, 5, request_id='BBBB33334444', method='POST', route='api/auth/login', status=401),
            at(RequestLog, 5, request_id='CCCC55556666', method='GET', route='api/lots/<str:token>', status=500),
        ],
        'jobs': [
            at(JobLog, 1, kind='email_failed', subject='Welcome to SSMS', detail='SMTPException', request_id='AAAA11112222'),
            at(JobLog, 5, kind='device_offline', subject='DHT22 A', detail='No reading for 30 minutes'),
        ],
    }


def expected_count(rows, stream):
    # Looking at the audit log is itself written in it, before the list is built, so the list holds that entry too.
    return len(rows[stream]) + (1 if stream == 'audit' else 0)


def data(response):
    assert response.status_code == 200, response.content
    return response.json()['data']


# ── who may ask ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('stream', STREAMS)
@pytest.mark.parametrize('role, expected', [('FARMER', 403), ('SUPERVISOR', 403)])
def test_only_an_admin_may_read_a_log(stream, role, expected):
    client = APIClient()
    client.force_authenticate(user=UserFactory(role=role))
    assert client.get(url(stream)).status_code == expected


@pytest.mark.parametrize('stream', STREAMS)
def test_a_stranger_is_told_to_sign_in(stream):
    assert APIClient().get(url(stream)).status_code == 401


def test_an_unknown_log_is_not_found(client):
    assert client.get(url('passwords')).status_code == 404


# ── what comes back ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('stream', STREAMS)
def test_each_log_lists_its_rows_newest_first_in_pages(client, rows, stream):
    response = client.get(url(stream))
    assert response.status_code == 200
    body = response.json()
    assert body['pagination']['totalItems'] == expected_count(rows, stream)
    stamps = [r['createdAt'] for r in body['data']]
    assert stamps == sorted(stamps, reverse=True)


def test_a_security_row_has_what_an_admin_needs(client, rows):
    row = data(client.get(url('security', kind='login_ok')))[0]
    assert {'id', 'kind', 'label', 'userEmail', 'ipAddress', 'requestId', 'detail', 'createdAt'} <= set(row)
    assert row['label'] == 'Signed in'


def test_a_request_row_has_the_route_and_no_body(client, rows):
    row = data(client.get(url('requests', status='500')))[0]
    assert {'id', 'requestId', 'method', 'route', 'status', 'durationMs', 'role', 'ipAddress', 'createdAt'} <= set(row)
    assert row['route'] == 'api/lots/<str:token>'


def test_an_audit_row_shows_what_changed_and_where_from(client, rows):
    row = data(client.get(url('audit', outcome='failure')))[0]
    assert {'requestId', 'changes', 'deviceLabel', 'onBehalfOfEmail', 'outcome'} <= set(row)


# ── filters ─────────────────────────────────────────────────────────────────────────────────

def test_a_reference_finds_the_same_request_in_every_log(client, rows):
    for stream, expected in (('audit', 1), ('security', 1), ('requests', 1), ('jobs', 1)):
        found = data(client.get(url(stream, reference='aaaa11112222')))
        assert len(found) == expected, stream


def test_a_date_range_keeps_only_those_days(client, rows):
    today = timezone.now().date()
    found = data(client.get(url('security', **{'from': (today - timedelta(days=2)).isoformat(), 'to': today.isoformat()})))
    assert [r['kind'] for r in found] == ['login_ok']


def test_a_bad_date_is_told_so(client):
    response = client.get(url('security', **{'from': 'yesterday'}))
    assert response.status_code == 422


def test_requests_filter_by_the_class_of_status(client, rows):
    assert {r['status'] for r in data(client.get(url('requests', status='4xx')))} == {401}
    assert {r['status'] for r in data(client.get(url('requests', status='5xx')))} == {500}
    assert len(data(client.get(url('requests', status='2xx')))) == 1


def test_requests_filter_by_route(client, rows):
    assert [r['route'] for r in data(client.get(url('requests', route='api/auth')))] == ['api/auth/login']


def test_security_and_jobs_filter_by_kind(client, rows):
    assert [r['kind'] for r in data(client.get(url('security', kind='lockout')))] == ['lockout']
    assert [r['kind'] for r in data(client.get(url('jobs', kind='device_offline')))] == ['device_offline']


def test_logs_filter_by_the_person(client, rows):
    for stream in ('audit', 'security'):
        found = data(client.get(url(stream, user='farmer@example.rw')))
        assert len(found) == 1, stream


def test_audit_filters_by_outcome(client, rows):
    assert len(data(client.get(url('audit', outcome='failure')))) == 1
    # The fixture's own entry and the entry for looking at the log.
    assert len(data(client.get(url('audit', outcome='success')))) == 2


def test_search_looks_in_the_text(client, rows):
    assert len(data(client.get(url('audit', search='Gisenyi')))) == 1
    assert len(data(client.get(url('jobs', search='Welcome')))) == 1
    assert len(data(client.get(url('security', search='Chrome')))) == 1


def test_a_filter_that_matches_nothing_gives_an_empty_page(client, rows):
    body = client.get(url('security', kind='login_ok', search='nothing like this')).json()
    assert body['data'] == [] and body['pagination']['totalItems'] == 0


# ── exports ─────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('stream', STREAMS)
def test_each_log_exports_as_csv(client, rows, stream):
    response = client.get(url(stream, export='csv'))
    assert response.status_code == 200
    assert response['Content-Type'].startswith('text/csv')
    assert f'{stream}_log' in response['Content-Disposition']
    lines = b''.join(response.streaming_content).decode().strip().splitlines()
    assert len(lines) == 1 + expected_count(rows, stream)


def test_an_export_follows_the_filters(client, rows):
    response = client.get(url('security', kind='lockout', export='csv'))
    lines = b''.join(response.streaming_content).decode().strip().splitlines()
    assert len(lines) == 2


def test_a_cell_that_would_run_as_a_formula_is_made_safe(client):
    JobLog.objects.create(kind='email_failed', subject='=HYPERLINK("http://evil.example")', detail='+cmd')
    text = b''.join(client.get(url('jobs', export='csv')).streaming_content).decode()
    assert "'=HYPERLINK" in text and "'+cmd" in text


# ── every look is itself written down ───────────────────────────────────────────────────────

def test_looking_at_a_log_leaves_an_audit_entry_naming_the_log(client, admin):
    client.get(url('security'))
    entry = AuditLog.objects.filter(resource='Logs').order_by('-id').first()
    assert entry.user_email == admin.email
    assert 'security' in entry.detail.lower()


def test_looking_again_within_a_minute_does_not_flood_the_audit_log(client):
    for _ in range(4):
        client.get(url('security'))
    assert AuditLog.objects.filter(resource='Logs').count() == 1


def test_a_different_log_is_a_different_entry(client):
    client.get(url('security'))
    client.get(url('jobs'))
    assert AuditLog.objects.filter(resource='Logs').count() == 2


def test_an_export_is_always_written_down_and_says_so(client):
    client.get(url('security'))
    client.get(url('security', export='csv'))
    client.get(url('security', export='csv'))
    exported = AuditLog.objects.filter(resource='Logs', detail__icontains='export')
    assert exported.count() == 2


def test_the_audit_log_endpoint_that_was_there_before_still_works(client, rows):
    assert client.get('/api/admin/audit-log').status_code == 200


def test_the_older_audit_endpoint_finds_a_reference_too(client, rows):
    found = client.get('/api/admin/audit-log?reference=aaaa11112222').json()['data']
    assert [r['requestId'] for r in found] == ['AAAA11112222']
