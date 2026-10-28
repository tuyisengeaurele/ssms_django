"""The cooperative report: one cooperative (or every one, for an admin) over a range of dates, as numbers, CSV or PDF."""
import io
from datetime import date, datetime, timedelta, timezone as dt_timezone
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from pypdf import PdfReader

from alerts.models import AlertLog
from audit_log.models import AuditLog
from batches.models import Batch
from farms.models import RearingRoom
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    CooperativeFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    HarvestRecordFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

URL = '/api/reports/cooperative'
# A month in the past, so a record made "now" in a test never falls inside the period.
FROM, TO = date(2026, 3, 1), date(2026, 3, 31)
RANGE = f'from={FROM}&to={TO}'


def at(day: date, hour=12, minute=0, second=0):
    return datetime(day.year, day.month, day.day, hour, minute, second, tzinfo=dt_timezone.utc)


@pytest.fixture
def coop():
    return CooperativeFactory(name='Gatsibo Silk')


@pytest.fixture
def supervisor(coop):
    return UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Mukamana')


@pytest.fixture
def owner(coop):
    return UserFactory(role='FARMER', cooperative=coop, name='Mugisha Serge')


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner, name='Hill Farm')


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN', name='Aline Uwase')


def harvest(farm, kg, grade='A', when=date(2026, 3, 10), silk=None, **over):
    batch = BatchFactory(farm=farm, stage='HARVEST')
    row = HarvestRecordFactory(batch=batch, cocoon_weight_kg=Decimal(str(kg)), quality_grade=grade, silk_yield_g=silk, **over)
    HarvestRecord.objects.filter(pk=row.pk).update(harvested_at=at(when))
    return row


def check(farm, result='Healthy', when=date(2026, 3, 10)):
    row = DiseaseDetectionFactory(batch=BatchFactory(farm=farm), result=result)
    DiseaseDetection.objects.filter(pk=row.pk).update(detected_at=at(when))
    return row


def alert(farm, kind='DISEASE', when=date(2026, 3, 10), **over):
    row = AlertLogFactory(batch=BatchFactory(farm=farm), type=kind, message='x', **over)
    AlertLog.objects.filter(pk=row.pk).update(created_at=at(when))
    return row


def get(client, query=RANGE, **extra):
    return client.get(f'{URL}?{query}', **extra)


def data(client, query=RANGE):
    response = get(client, query)
    assert response.status_code == 200, response.content[:300]
    return response.json()['data']


def pdf_text(response):
    assert response.status_code == 200, response.content[:300]
    return '\n'.join(page.extract_text() for page in PdfReader(io.BytesIO(response.content)).pages)


# ── who may ask ─────────────────────────────────────────────────────────────

def test_a_supervisor_may_ask(auth_client, supervisor):
    assert get(auth_client(supervisor)).status_code == 200


def test_an_admin_may_ask(auth_client, admin):
    assert get(auth_client(admin)).status_code == 200


def test_a_farmer_is_refused(auth_client, owner):
    assert get(auth_client(owner)).status_code == 403


def test_a_stranger_gets_nothing(api_client):
    assert get(api_client).status_code == 401


def test_a_supervisor_without_a_cooperative_is_told_kindly(auth_client):
    response = get(auth_client(UserFactory(role='SUPERVISOR')))
    assert response.status_code == 422
    assert response.json()['message'] == 'You are not part of a cooperative yet.'


def test_a_supervisor_sees_only_their_cooperative(auth_client, supervisor, farm):
    other = FarmFactory(owner=UserFactory(role='FARMER', cooperative=CooperativeFactory()), name='Elsewhere Farm')
    harvest(farm, 5)
    harvest(other, 90)
    report = data(auth_client(supervisor))
    assert [f['name'] for f in report['farms']] == ['Hill Farm']
    assert report['harvest']['totalKg'] == 5.0


def test_a_supervisor_cannot_widen_the_report_by_asking_for_another_cooperative(auth_client, supervisor, farm):
    rival = CooperativeFactory()
    FarmFactory(owner=UserFactory(role='FARMER', cooperative=rival), name='Elsewhere Farm')
    report = data(auth_client(supervisor), f'{RANGE}&cooperative={rival.pk}')
    assert [f['name'] for f in report['farms']] == ['Hill Farm']


def test_an_admin_sees_every_cooperative_by_default(auth_client, admin, farm):
    FarmFactory(owner=UserFactory(role='FARMER', cooperative=CooperativeFactory()), name='Elsewhere Farm')
    report = data(auth_client(admin))
    assert {f['name'] for f in report['farms']} == {'Hill Farm', 'Elsewhere Farm'}
    assert report['cooperative'] is None


def test_an_admin_may_choose_one_cooperative(auth_client, admin, coop, farm):
    FarmFactory(owner=UserFactory(role='FARMER', cooperative=CooperativeFactory()), name='Elsewhere Farm')
    report = data(auth_client(admin), f'{RANGE}&cooperative={coop.pk}')
    assert [f['name'] for f in report['farms']] == ['Hill Farm']
    assert report['cooperative'] == {'id': coop.pk, 'name': 'Gatsibo Silk'}


def test_an_admin_may_ask_for_all_by_name(auth_client, admin, farm):
    assert len(data(auth_client(admin), f'{RANGE}&cooperative=all')['farms']) == 1


def test_an_unknown_cooperative_is_not_found(auth_client, admin):
    assert get(auth_client(admin), f'{RANGE}&cooperative=nope').status_code == 404


def test_a_deleted_farm_is_left_out(auth_client, supervisor, farm):
    farm.is_active = False
    farm.save(update_fields=['is_active'])
    assert data(auth_client(supervisor))['farms'] == []


# ── the period ──────────────────────────────────────────────────────────────

def test_the_period_is_echoed_back(auth_client, supervisor):
    assert data(auth_client(supervisor))['period'] == {'from': '2026-03-01', 'to': '2026-03-31'}


def test_without_dates_the_report_covers_the_last_thirty_days(auth_client, supervisor):
    report = data(auth_client(supervisor), '')
    today = timezone.now().date()
    assert report['period'] == {'from': str(today - timedelta(days=29)), 'to': str(today)}


def test_only_an_end_date_gives_thirty_days_up_to_it(auth_client, supervisor):
    assert data(auth_client(supervisor), 'to=2026-03-31')['period'] == {'from': '2026-03-02', 'to': '2026-03-31'}


def test_one_day_is_a_period(auth_client, supervisor):
    assert get(auth_client(supervisor), 'from=2026-03-05&to=2026-03-05').status_code == 200


def test_the_last_day_of_the_period_counts_to_its_final_second(auth_client, supervisor, farm):
    harvest(farm, 5, when=TO)
    row = harvest(farm, 7, when=TO)
    HarvestRecord.objects.filter(pk=row.pk).update(harvested_at=at(TO, 23, 59, 59))
    assert data(auth_client(supervisor))['harvest']['records'] == 2


def test_the_first_day_counts_from_its_first_second(auth_client, supervisor, farm):
    row = harvest(farm, 5)
    HarvestRecord.objects.filter(pk=row.pk).update(harvested_at=at(FROM, 0, 0, 0))
    assert data(auth_client(supervisor))['harvest']['records'] == 1


def test_a_moment_outside_the_period_does_not_count(auth_client, supervisor, farm):
    before = harvest(farm, 5)
    after = harvest(farm, 6)
    HarvestRecord.objects.filter(pk=before.pk).update(harvested_at=at(FROM - timedelta(days=1), 23, 59, 59))
    HarvestRecord.objects.filter(pk=after.pk).update(harvested_at=at(TO + timedelta(days=1), 0, 0, 0))
    assert data(auth_client(supervisor))['harvest']['records'] == 0


@pytest.mark.parametrize('query', ['from=yesterday&to=2026-03-31', 'from=2026-13-01&to=2026-03-31', 'from=2026-03-01&to=31/10/2026', 'from=&to=x'])
def test_a_date_that_is_not_a_date_is_refused_kindly(auth_client, supervisor, query):
    response = get(auth_client(supervisor), query)
    assert response.status_code == 422
    assert response.json()['message'] == 'Please give dates as year, month and day, for example 2026-10-31.'


def test_an_end_before_the_start_is_refused(auth_client, supervisor):
    response = get(auth_client(supervisor), 'from=2026-03-31&to=2026-03-01')
    assert response.status_code == 422
    assert response.json()['message'] == 'The end date cannot be before the start date.'


def test_a_period_may_be_a_year_and_no_more(auth_client, supervisor):
    assert get(auth_client(supervisor), 'from=2026-01-01&to=2026-12-31').status_code == 200
    response = get(auth_client(supervisor), 'from=2025-12-30&to=2026-12-31')
    assert response.status_code == 422
    assert response.json()['message'] == 'A report can cover up to one year.'


# ── what is counted ─────────────────────────────────────────────────────────

def test_the_totals_count_farms_farmers_and_batches(auth_client, supervisor, coop, farm, owner):
    second = FarmFactory(owner=owner, name='River Farm')
    third = FarmFactory(owner=UserFactory(role='FARMER', cooperative=coop), name='Lake Farm')
    BatchFactory(farm=farm)
    BatchFactory(farm=second)
    BatchFactory(farm=third)
    BatchFactory(farm=third, is_active=False)
    started = BatchFactory(farm=third)
    Batch.objects.filter(pk=started.pk).update(start_date=at(date(2026, 3, 12)))
    Batch.objects.exclude(pk=started.pk).update(start_date=at(date(2026, 8, 1)))
    totals = data(auth_client(supervisor))['totals']
    assert totals == {'farms': 3, 'farmers': 2, 'batchesRunning': 4, 'batchesStarted': 1}


def test_harvest_is_summed_with_grades_inside_the_period_only(auth_client, supervisor, farm):
    harvest(farm, 12.5, 'A', silk='900')
    harvest(farm, 4, 'B')
    harvest(farm, 99, 'A', when=date(2026, 9, 1))
    harvest(farm, 50, 'C', is_active=False)
    report = data(auth_client(supervisor))['harvest']
    assert report['records'] == 2 and report['totalKg'] == 16.5 and report['silkG'] == 900.0
    assert report['byGrade'] == [{'grade': 'A', 'count': 1, 'totalKg': 12.5}, {'grade': 'B', 'count': 1, 'totalKg': 4.0}]


def test_the_harvest_of_a_deleted_batch_is_not_counted(auth_client, supervisor, farm):
    row = harvest(farm, 30)
    Batch.objects.filter(pk=row.batch_id).update(is_active=False)
    assert data(auth_client(supervisor))['harvest']['records'] == 0


def test_a_period_with_no_harvest_has_zeros_and_no_grades(auth_client, supervisor, farm):
    report = data(auth_client(supervisor))['harvest']
    assert report == {'records': 0, 'totalKg': 0.0, 'silkG': 0.0, 'byGrade': []}


def test_disease_checks_are_counted_by_result(auth_client, supervisor, farm):
    check(farm, 'Healthy')
    check(farm, 'Pebrine')
    check(farm, 'Pebrine')
    check(farm, 'Flacherie', when=date(2026, 9, 1))
    report = data(auth_client(supervisor))['checks']
    assert report['total'] == 3 and report['found'] == 2
    assert report['byResult'] == [{'result': 'Pebrine', 'count': 2}, {'result': 'Healthy', 'count': 1}]


def test_alerts_are_counted_by_type_with_how_many_were_acknowledged_and_resolved(auth_client, supervisor, farm):
    alert(farm, 'DISEASE', acknowledged_by=supervisor, acknowledged_at=at(date(2026, 3, 11)))
    alert(farm, 'TEMPERATURE', resolved_at=at(date(2026, 3, 11)))
    alert(farm, 'TEMPERATURE')
    alert(farm, 'DISEASE', when=date(2026, 9, 1))
    report = data(auth_client(supervisor))['alerts']
    assert (report['total'], report['acknowledged'], report['resolved']) == (3, 1, 1)
    assert report['byType'] == [{'type': 'TEMPERATURE', 'count': 2}, {'type': 'DISEASE', 'count': 1}]


def test_alerts_about_a_room_are_counted_for_its_farm(auth_client, supervisor, farm):
    room = RearingRoom.objects.create(farm=farm, name='Rearing house 1')
    row = AlertLogFactory(batch=None, room=room, type='TEMPERATURE', message='x')
    AlertLog.objects.filter(pk=row.pk).update(created_at=at(date(2026, 3, 10)))
    report = data(auth_client(supervisor))
    assert report['alerts']['total'] == 1
    assert report['farms'][0]['alerts'] == 1


def test_each_farm_has_its_own_harvest_and_alert_numbers(auth_client, supervisor, owner):
    one, two = FarmFactory(owner=owner, name='One'), FarmFactory(owner=owner, name='Two')
    harvest(one, 10)
    harvest(two, 3)
    harvest(two, 4)
    alert(two, 'HUMIDITY')
    rows = {f['name']: f for f in data(auth_client(supervisor))['farms']}
    assert (rows['One']['harvestKg'], rows['One']['alerts']) == (10.0, 0)
    assert (rows['Two']['harvestKg'], rows['Two']['alerts']) == (7.0, 1)


def test_the_farms_come_in_risk_order_with_their_level(auth_client, supervisor, owner):
    calm, risky = FarmFactory(owner=owner, name='A calm'), FarmFactory(owner=owner, name='B risky')
    batch = BatchFactory(farm=risky)
    AlertLogFactory(batch=batch, type='DISEASE', message='x')
    rows = data(auth_client(supervisor))['farms']
    assert [(f['name'], f['level']) for f in rows] == [('B risky', 'HIGH'), ('A calm', 'OK')]
    assert rows[0]['ownerName'] == 'Mugisha Serge' and rows[0]['diseaseAlerts'] == 1
    assert calm.pk


def test_the_report_says_when_it_was_made(auth_client, supervisor):
    assert data(auth_client(supervisor))['generatedAt']


def test_the_query_count_does_not_grow_with_the_farms(auth_client, supervisor, owner):
    def cost(client):
        with CaptureQueriesContext(connection) as queries:
            assert get(client).status_code == 200
        return len(queries)

    client = auth_client(supervisor)
    first = FarmFactory(owner=owner, name='First')
    harvest(first, 5)
    alert(first)
    check(first)
    few = cost(client)
    for i in range(8):
        extra = FarmFactory(owner=owner, name=f'Farm {i}')
        harvest(extra, 2)
        alert(extra)
        check(extra)
    assert cost(client) == few


# ── CSV ─────────────────────────────────────────────────────────────────────

def test_the_csv_has_the_numbers_and_a_dated_file_name(auth_client, supervisor, farm):
    harvest(farm, 12.5, 'A')
    response = get(auth_client(supervisor), f'{RANGE}&export=csv')
    assert response.status_code == 200
    assert response['Content-Type'].startswith('text/csv')
    assert response['Content-Disposition'] == 'attachment; filename="cooperative_report_2026-03-01_2026-03-31.csv"'
    body = b''.join(response.streaming_content).decode()
    assert 'Hill Farm' in body and '12.5' in body and 'Gatsibo Silk' in body
    assert '2026-03-01' in body and '2026-03-31' in body


def test_the_csv_cannot_run_a_formula_in_a_spreadsheet(auth_client, supervisor, owner):
    FarmFactory(owner=owner, name='=HYPERLINK("http://evil.example")')
    body = b''.join(get(auth_client(supervisor), f'{RANGE}&export=csv').streaming_content).decode()
    assert "'=HYPERLINK" in body


def test_the_csv_follows_the_same_scope_as_the_numbers(auth_client, supervisor, farm):
    FarmFactory(owner=UserFactory(role='FARMER', cooperative=CooperativeFactory()), name='Elsewhere Farm')
    body = b''.join(get(auth_client(supervisor), f'{RANGE}&export=csv').streaming_content).decode()
    assert 'Hill Farm' in body and 'Elsewhere Farm' not in body


def test_a_farmer_cannot_download_the_csv(auth_client, owner):
    assert get(auth_client(owner), f'{RANGE}&export=csv').status_code == 403


# ── PDF ─────────────────────────────────────────────────────────────────────

def test_the_pdf_is_on_the_letterhead_with_the_period_and_who_asked(auth_client, supervisor, farm):
    harvest(farm, 12.5, 'A', silk='900')
    response = get(auth_client(supervisor), f'{RANGE}&export=pdf')
    assert response['Content-Type'] == 'application/pdf'
    assert response['Content-Disposition'] == 'attachment; filename="cooperative_report_2026-03-01_2026-03-31.pdf"'
    text = pdf_text(response)
    assert 'Cooperative report' in text and 'Gatsibo Silk' in text
    assert 'From 1 March 2026 to 31 March 2026' in text
    assert 'Generated by Claire Mukamana' in text
    assert 'Smart Sericulture Management System' in text


def test_the_pdf_shows_the_sections_and_the_numbers(auth_client, supervisor, farm):
    harvest(farm, 12.5, 'A', silk='900')
    check(farm, 'Pebrine')
    alert(farm, 'DISEASE', acknowledged_by=supervisor, acknowledged_at=at(date(2026, 3, 11)))
    # The risk level is for today, not for the period, so it needs an alert from the last two weeks.
    AlertLogFactory(batch=BatchFactory(farm=farm), type='DISEASE', message='Pebrine suspected')
    text = pdf_text(get(auth_client(supervisor), f'{RANGE}&export=pdf'))
    assert '1 records, 12.5 kg of cocoons, 900 g of silk.' in text or '1 record, 12.5 kg of cocoons, 900 g of silk.' in text
    assert '1 check, 1 found a disease.' in text
    assert '1 alert, 1 acknowledged, 0 resolved.' in text
    assert 'Hill Farm' in text and 'Mugisha Serge' in text and 'High' in text
    assert '1 disease alert in the last 14 days' in text


def test_the_pdf_says_so_when_nothing_happened_in_the_period(auth_client, supervisor, farm):
    text = pdf_text(get(auth_client(supervisor), f'{RANGE}&export=pdf'))
    for line in ('No harvest recorded in the period.', 'No disease checks in the period.', 'No alerts in the period.'):
        assert line in text


def test_the_pdf_for_all_cooperatives_says_so(auth_client, admin, farm):
    assert 'All cooperatives' in pdf_text(get(auth_client(admin), f'{RANGE}&export=pdf'))


def test_the_pdf_reads_in_french(auth_client, supervisor, farm):
    text = pdf_text(get(auth_client(supervisor), f'{RANGE}&export=pdf&lang=fr'))
    assert 'Rapport de la coopérative' in text
    assert 'Du 1 mars 2026 au 31 mars 2026' in text
    assert 'Page 1 sur' in text


def test_the_pdf_reads_in_kinyarwanda(auth_client, supervisor, farm):
    text = pdf_text(get(auth_client(supervisor), f'{RANGE}&export=pdf&lang=rw'))
    assert 'Raporo ya koperative' in text
    assert 'Urupapuro 1 kuri' in text


def test_an_unknown_language_reads_in_english(auth_client, supervisor, farm):
    assert 'Cooperative report' in pdf_text(get(auth_client(supervisor), f'{RANGE}&export=pdf&lang=zz'))


def test_a_farm_name_with_markup_is_shown_as_text(auth_client, supervisor, owner):
    FarmFactory(owner=owner, name='<b>Tom</b> & <script>x</script>')
    assert '<b>Tom</b> & <script>x</script>' in pdf_text(get(auth_client(supervisor), f'{RANGE}&export=pdf'))


def test_many_farms_run_over_pages_and_are_numbered(auth_client, supervisor, owner):
    for i in range(80):
        FarmFactory(owner=owner, name=f'Farm number {i:02d}')
    response = get(auth_client(supervisor), f'{RANGE}&export=pdf')
    pages = PdfReader(io.BytesIO(response.content)).pages
    assert len(pages) >= 2
    assert f'Page 1 of {len(pages)}' in pages[0].extract_text()


def test_a_farmer_cannot_download_the_pdf(auth_client, owner):
    assert get(auth_client(owner), f'{RANGE}&export=pdf').status_code == 403


# ── the audit log ───────────────────────────────────────────────────────────

@pytest.mark.parametrize('kind', ['csv', 'pdf'])
def test_a_download_is_written_to_the_audit_log(auth_client, supervisor, farm, kind):
    get(auth_client(supervisor), f'{RANGE}&export={kind}')
    entry = AuditLog.objects.get(resource='CooperativeReport')
    assert entry.action == 'OTHER'
    assert kind in entry.detail and '2026-03-01' in entry.detail and 'Gatsibo Silk' in entry.detail


def test_looking_at_the_numbers_is_not_written_to_the_audit_log(auth_client, supervisor, farm):
    get(auth_client(supervisor))
    assert not AuditLog.objects.filter(resource='CooperativeReport').exists()
