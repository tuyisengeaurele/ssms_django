import pytest
from django.test import RequestFactory
from rest_framework.request import Request

from audit_log.models import AuditLog
from core.csvsafe import csv_safe
from core.params import ParamError, date_param, int_param
from tests.factories import (
    BatchFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    HarvestRecordFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

FORMULA = '=HYPERLINK("http://evil.example","click")'


def request_with(**params):
    return Request(RequestFactory().get('/x', params))


# ── the helpers on their own ────────────────────────────────────────────────────────────────

def test_int_param_uses_the_default_when_absent_or_blank():
    assert int_param(request_with(), 'limit', 100, 1, 500) == 100
    assert int_param(request_with(limit=''), 'limit', 100, 1, 500) == 100


@pytest.mark.parametrize('value, expected', [('1', 1), ('250', 250), ('500', 500), ('007', 7)])
def test_int_param_accepts_whole_numbers_in_range(value, expected):
    assert int_param(request_with(limit=value), 'limit', 100, 1, 500) == expected


@pytest.mark.parametrize('value', ['abc', '0', '-5', '501', '1.5', '1e3', ' 7', '7 ', '٣', '', 'NaN'])
def test_int_param_refuses_everything_else(value):
    if value == '':
        return  # blank means "not given", covered above
    with pytest.raises(ParamError) as caught:
        int_param(request_with(limit=value), 'limit', 100, 1, 500)
    assert 'limit' in str(caught.value.detail)
    assert '500' in str(caught.value.detail)


def test_date_param_reads_iso_dates_only():
    assert str(date_param(request_with(date_from='2026-10-01'), 'date_from')) == '2026-10-01'
    assert date_param(request_with(), 'date_from') is None
    for bad in ['garbage', '2026-13-01', '2026-02-30', '01/10/2026', '20261001', '2026-1-1', '2026-10-01T00:00']:
        with pytest.raises(ParamError):
            date_param(request_with(date_from=bad), 'date_from')


# ── the endpoints refuse bad input with a 422, never a 500 ──────────────────────────────────

@pytest.mark.parametrize('url', [
    '/api/sensors/chart?hours=abc', '/api/sensors/chart?hours=0', '/api/sensors/chart?hours=-5',
    '/api/sensors/chart?hours=99999',
    '/api/alerts?limit=x', '/api/alerts?limit=0', '/api/alerts?limit=501',
    '/api/detections/history?limit=x', '/api/detections/history?limit=501',
    '/api/detections/history?date_from=garbage', '/api/detections/history?date_to=2026-02-30',
    '/api/detections/stats?date_from=garbage', '/api/detections/stats?date_to=nope',
    '/api/detections/recent?limit=x', '/api/detections/recent?limit=101',
])
def test_bad_query_parameters_are_a_422(auth_client, url):
    response = auth_client(UserFactory(role='ADMIN')).get(url)
    assert response.status_code == 422, url
    assert response.json()['success'] is False
    assert 'Please' in response.json()['message']


@pytest.mark.parametrize('url', [
    '/api/sensors/chart', '/api/sensors/chart?hours=168', '/api/sensors/chart?hours=1',
    '/api/alerts', '/api/alerts?limit=500', '/api/alerts?limit=1',
    '/api/detections/history', '/api/detections/history?date_from=2026-01-01&date_to=2026-12-31&limit=500',
    '/api/detections/stats?date_from=2026-01-01', '/api/detections/recent', '/api/detections/recent?limit=100',
])
def test_good_query_parameters_still_work(auth_client, url):
    assert auth_client(UserFactory(role='ADMIN')).get(url).status_code == 200, url


# ── csv_safe ────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('value', ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1', FORMULA])
def test_csv_safe_defuses_cells_that_start_like_a_formula(value):
    assert csv_safe(value) == "'" + value


@pytest.mark.parametrize('value', ['ok', 'a=b', '', 'Serge', '1+1'])
def test_csv_safe_leaves_ordinary_text_alone(value):
    assert csv_safe(value) == value


@pytest.mark.parametrize('value', [5, 3.5, None, True])
def test_csv_safe_leaves_other_types_alone(value):
    assert csv_safe(value) == value


# ── a formula planted in the data is neutralised in every export ───────────────────────────

def cells(response):
    return b''.join(response.streaming_content).decode()


def test_the_detection_export_defuses_formulas(auth_client):
    owner = UserFactory()
    batch = BatchFactory(farm=FarmFactory(owner=owner))
    DiseaseDetectionFactory(batch=batch, notes=FORMULA)
    text = cells(auth_client(owner).get('/api/detections/history?export=csv'))
    assert "'" + FORMULA.replace('"', '""') in text
    assert ',' + FORMULA not in text


def test_the_harvest_export_defuses_formulas(auth_client):
    owner = UserFactory()
    batch = BatchFactory(farm=FarmFactory(owner=owner, name='=cmd|calc'))
    HarvestRecordFactory(batch=batch, notes=FORMULA)
    text = cells(auth_client(owner).get('/api/harvest?export=csv'))
    assert "'" + FORMULA.replace('"', '""') in text
    assert "'=cmd|calc" in text


def test_the_audit_export_defuses_formulas(auth_client):
    admin = UserFactory(role='ADMIN')
    AuditLog.objects.create(user_name='+evil', user_email=admin.email, action='OTHER', resource='X', detail=FORMULA)
    text = cells(auth_client(admin).get('/api/admin/audit-log?export=csv'))
    assert "'" + FORMULA.replace('"', '""') in text
    assert "'+evil" in text


def test_the_system_report_export_defuses_formulas(auth_client):
    admin = UserFactory(role='ADMIN')
    UserFactory(name='=2+2', role='FARMER', cooperative=None)
    farm_owner = UserFactory(name='@attack')
    FarmFactory(owner=farm_owner)
    text = cells(auth_client(admin).get('/api/admin/reports?export=csv'))
    assert ',=2+2' not in text and ',@attack' not in text
