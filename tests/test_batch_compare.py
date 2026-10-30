"""GET /api/batches/compare?ids=a,b: two to four batches side by side, for the page that shows which one did better."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from alerts.models import StageThreshold
from batches.models import MortalityRecord
from harvest.models import HarvestRecord
from tests.factories import (
    AlertLogFactory,
    BatchFactory,
    CooperativeFactory,
    DiseaseDetectionFactory,
    FarmFactory,
    HarvestRecordFactory,
    SensorReadingFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

URL = '/api/batches/compare'


@pytest.fixture
def owner():
    return UserFactory(role='FARMER')


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner, name='Hill Farm')


def make(farm, **kwargs):
    return BatchFactory(farm=farm, **kwargs)


def start(batch, days_ago):
    """start_date is set when the row is made, so move it afterwards."""
    batch.__class__.objects.filter(pk=batch.pk).update(start_date=timezone.now() - timedelta(days=days_ago))
    batch.refresh_from_db()


def harvest(batch, kg, grade='A', days_after_start=28, silk_g=None):
    record = HarvestRecordFactory(batch=batch, cocoon_weight_kg=Decimal(str(kg)), quality_grade=grade, silk_yield_g=silk_g)
    HarvestRecord.objects.filter(pk=record.pk).update(harvested_at=batch.start_date + timedelta(days=days_after_start))
    return record


def compare(client, *batches, ids=None):
    value = ids if ids is not None else ','.join(b.pk for b in batches)
    return client.get(f'{URL}?ids={value}')


def rows(response):
    return response.data['data']['batches']


class TestShape:
    def test_gives_each_batch_with_the_facts_the_page_shows(self, auth_client, owner, farm):
        a = make(farm, stage='COCOON', breed='Bivoltine', quantity=3, quantity_unit='BOXES')
        b = make(farm, stage='PUPA')
        start(a, 20)
        response = compare(auth_client(owner), a, b)
        assert response.status_code == 200
        first = rows(response)[0]
        assert first['id'] == a.pk
        assert first['code'] == a.pk[-8:].upper()
        assert first['farm'] == {'id': farm.pk, 'name': 'Hill Farm'}
        assert first['breed'] == 'Bivoltine'
        assert first['stage'] == 'COCOON'
        assert first['quantity'] == 3
        assert first['quantity_unit'] == 'BOXES'
        assert first['days_running'] == 20
        assert 'start_date' in first and 'expected_harvest_date' in first

    def test_keeps_the_order_that_was_asked_for(self, auth_client, owner, farm):
        a, b, c = make(farm), make(farm), make(farm)
        response = compare(auth_client(owner), c, a, b)
        assert [r['id'] for r in rows(response)] == [c.pk, a.pk, b.pk]

    def test_names_the_room_a_batch_is_in(self, auth_client, owner, farm):
        from farms.models import RearingRoom

        room = RearingRoom.objects.create(farm=farm, name='Rearing house 1')
        a = make(farm, room=room)
        b = make(farm)
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['room'] == 'Rearing house 1'
        assert second['room'] is None


class TestDeaths:
    def test_adds_up_the_deaths_that_were_not_deleted(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        MortalityRecord.objects.create(batch=a, count=30, recorded_on=timezone.now().date())
        MortalityRecord.objects.create(batch=a, count=20, recorded_on=timezone.now().date())
        MortalityRecord.objects.create(batch=a, count=999, recorded_on=timezone.now().date(), is_active=False)
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['deaths'] == 50
        assert second['deaths'] == 0

    def test_gives_a_death_rate_when_the_start_was_counted_in_worms(self, auth_client, owner, farm):
        a = make(farm, quantity=1000, quantity_unit='WORMS')
        b = make(farm, quantity=1000, quantity_unit='WORMS')
        MortalityRecord.objects.create(batch=a, count=125, recorded_on=timezone.now().date())
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['death_rate_pct'] == 12.5
        assert second['death_rate_pct'] == 0.0

    def test_gives_no_death_rate_when_the_start_was_counted_in_boxes(self, auth_client, owner, farm):
        a = make(farm, quantity=2, quantity_unit='BOXES')
        b = make(farm, quantity=1000, quantity_unit='WORMS')
        MortalityRecord.objects.create(batch=a, count=40, recorded_on=timezone.now().date())
        first, _ = rows(compare(auth_client(owner), a, b))
        assert first['death_rate_pct'] is None

    def test_gives_no_death_rate_when_no_start_count_was_given(self, auth_client, owner, farm):
        a, b = make(farm, quantity=None, quantity_unit='WORMS'), make(farm)
        MortalityRecord.objects.create(batch=a, count=40, recorded_on=timezone.now().date())
        first, _ = rows(compare(auth_client(owner), a, b))
        assert first['death_rate_pct'] is None


class TestHarvest:
    def test_totals_the_harvest_and_counts_the_grades(self, auth_client, owner, farm):
        a, b = make(farm, stage='HARVEST'), make(farm)
        harvest(a, 10, 'A', silk_g=200)
        harvest(a, 4.5, 'B', silk_g=90)
        harvest(a, 1, 'A')
        harvest(a, 50, 'C').delete()  # a record that is gone does not count
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['harvest']['records'] == 3
        assert first['harvest']['cocoon_kg'] == 15.5
        assert first['harvest']['silk_g'] == 290.0
        assert first['harvest']['grades'] == {'A': 2, 'B': 1, 'C': 0}
        assert second['harvest']['records'] == 0
        assert second['harvest']['cocoon_kg'] == 0.0
        assert second['harvest']['grades'] == {'A': 0, 'B': 0, 'C': 0}

    def test_ignores_a_record_hidden_by_deleting_it(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        gone = harvest(a, 8)
        HarvestRecord.objects.filter(pk=gone.pk).update(is_active=False)
        harvest(a, 2)
        first, _ = rows(compare(auth_client(owner), a, b))
        assert first['harvest']['cocoon_kg'] == 2.0

    def test_works_out_the_yield_per_box(self, auth_client, owner, farm):
        a = make(farm, quantity=4, quantity_unit='BOXES')
        b = make(farm, quantity=2, quantity_unit='BOXES')
        harvest(a, 10)
        harvest(b, 7)
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['harvest']['yield_per_unit'] == {'unit': 'BOXES', 'kg': 2.5}
        assert second['harvest']['yield_per_unit'] == {'unit': 'BOXES', 'kg': 3.5}

    def test_works_out_the_yield_per_thousand_worms(self, auth_client, owner, farm):
        a = make(farm, quantity=5000, quantity_unit='WORMS')
        b = make(farm)
        harvest(a, 10)
        first, _ = rows(compare(auth_client(owner), a, b))
        assert first['harvest']['yield_per_unit'] == {'unit': 'WORMS', 'kg': 2.0}

    def test_gives_no_yield_without_a_harvest_or_a_start_count(self, auth_client, owner, farm):
        no_harvest = make(farm, quantity=3, quantity_unit='BOXES')
        no_count = make(farm, quantity=None)
        harvest(no_count, 5)
        first, second = rows(compare(auth_client(owner), no_harvest, no_count))
        assert first['harvest']['yield_per_unit'] is None
        assert second['harvest']['yield_per_unit'] is None

    def test_draws_the_harvest_so_far_by_the_day_since_the_batch_started(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        start(a, 40)
        harvest(a, 6, days_after_start=30)
        harvest(a, 4, days_after_start=33)
        harvest(a, 1, days_after_start=33)
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['harvest']['curve'] == [{'day': 30, 'kg': 6.0}, {'day': 33, 'kg': 10.0}, {'day': 33, 'kg': 11.0}]
        assert second['harvest']['curve'] == []

    def test_never_draws_a_day_before_the_start(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        harvest(a, 3, days_after_start=-2)
        first, _ = rows(compare(auth_client(owner), a, b))
        assert first['harvest']['curve'][0]['day'] == 0


class TestConditions:
    def test_says_how_much_of_the_time_was_inside_the_safe_range(self, auth_client, owner, farm):
        StageThreshold.objects.update_or_create(stage='LARVA', defaults={'temp_min': 22, 'temp_max': 28, 'hum_min': 70, 'hum_max': 85})
        a, b = make(farm, stage='LARVA'), make(farm, stage='LARVA')
        for temperature, humidity in [(25, 75), (26, 80), (30, 75), (24, 60)]:
            SensorReadingFactory(batch=a, temperature=temperature, humidity=humidity)
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['conditions'] == {'in_range_pct': 50, 'readings': 4}
        assert second['conditions'] is None

    def test_ignores_readings_of_other_batches(self, auth_client, owner, farm):
        StageThreshold.objects.update_or_create(stage='LARVA', defaults={'temp_min': 22, 'temp_max': 28, 'hum_min': 70, 'hum_max': 85})
        a, b = make(farm, stage='LARVA'), make(farm, stage='LARVA')
        SensorReadingFactory(batch=b, temperature=25, humidity=75)
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['conditions'] is None
        assert second['conditions']['readings'] == 1


class TestChecksAndAlerts:
    def test_counts_the_disease_checks_and_the_grasserie_among_them(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        DiseaseDetectionFactory(batch=a, result='Healthy')
        DiseaseDetectionFactory(batch=a, result='Grasserie')
        DiseaseDetectionFactory(batch=a, result='Grasserie')
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['checks'] == {'total': 3, 'grasserie': 2}
        assert second['checks'] == {'total': 0, 'grasserie': 0}

    def test_counts_the_alerts_about_a_problem(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        AlertLogFactory(batch=a, type='TEMPERATURE')
        AlertLogFactory(batch=a, type='HUMIDITY')
        AlertLogFactory(batch=a, type='DISEASE')
        first, second = rows(compare(auth_client(owner), a, b))
        assert first['alerts'] == 3
        assert second['alerts'] == 0

    def test_does_not_count_notices_that_are_not_problems(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        AlertLogFactory(batch=a, type='STAGE_CHANGE')
        AlertLogFactory(batch=a, type='STAGE_CHANGE')
        AlertLogFactory(batch=a, type='SYSTEM')
        AlertLogFactory(batch=a, type='TEMPERATURE')
        first, _ = rows(compare(auth_client(owner), a, b))
        assert first['alerts'] == 1


class TestWhichBatchesMayBeCompared:
    def test_a_farmer_cannot_compare_another_farmers_batch(self, auth_client, owner, farm):
        mine = make(farm)
        theirs = make(FarmFactory(owner=UserFactory(role='FARMER')))
        response = compare(auth_client(owner), mine, theirs)
        assert response.status_code == 404

    def test_a_missing_batch_is_the_same_answer_as_someone_elses(self, auth_client, owner, farm):
        mine = make(farm)
        theirs = make(FarmFactory(owner=UserFactory(role='FARMER')))
        missing = compare(auth_client(owner), ids=f'{mine.pk},does-not-exist')
        not_theirs = compare(auth_client(owner), mine, theirs)
        assert missing.status_code == not_theirs.status_code == 404
        assert missing.data == not_theirs.data

    def test_a_deleted_batch_cannot_be_compared(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        a.is_active = False
        a.save()
        assert compare(auth_client(owner), a, b).status_code == 404

    def test_a_supervisor_compares_the_batches_of_their_cooperative_only(self, auth_client):
        coop = CooperativeFactory()
        supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
        member = UserFactory(role='FARMER', cooperative=coop)
        outsider = UserFactory(role='FARMER', cooperative=CooperativeFactory())
        inside_a, inside_b = make(FarmFactory(owner=member)), make(FarmFactory(owner=member))
        outside = make(FarmFactory(owner=outsider))
        assert compare(auth_client(supervisor), inside_a, inside_b).status_code == 200
        assert compare(auth_client(supervisor), inside_a, outside).status_code == 404

    def test_an_administrator_compares_any_batches(self, auth_client):
        admin = UserFactory(role='ADMIN')
        a = make(FarmFactory(owner=UserFactory(role='FARMER')))
        b = make(FarmFactory(owner=UserFactory(role='FARMER')))
        assert compare(auth_client(admin), a, b).status_code == 200

    def test_needs_a_sign_in(self, api_client, farm):
        a, b = make(farm), make(farm)
        assert compare(api_client, a, b).status_code == 401


class TestWhatIsAsked:
    @pytest.mark.parametrize('ids', ['', ',', ' , '])
    def test_needs_some_ids(self, auth_client, owner, ids):
        response = compare(auth_client(owner), ids=ids)
        assert response.status_code == 422

    def test_needs_at_least_two_different_batches(self, auth_client, owner, farm):
        a = make(farm)
        assert compare(auth_client(owner), ids=a.pk).status_code == 422
        assert compare(auth_client(owner), ids=f'{a.pk},{a.pk}').status_code == 422

    def test_takes_at_most_four(self, auth_client, owner, farm):
        batches = [make(farm) for _ in range(5)]
        assert compare(auth_client(owner), *batches[:4]).status_code == 200
        response = compare(auth_client(owner), *batches)
        assert response.status_code == 422
        assert '4' in response.data['message']

    def test_leaves_out_a_batch_named_twice(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        response = compare(auth_client(owner), ids=f'{a.pk},{b.pk},{a.pk}')
        assert [r['id'] for r in rows(response)] == [a.pk, b.pk]

    def test_forgives_spaces_around_the_ids(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        response = compare(auth_client(owner), ids=f' {a.pk} , {b.pk} ')
        assert response.status_code == 200

    def test_does_not_change_anything(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        assert auth_client(owner).post(f'{URL}?ids={a.pk},{b.pk}').status_code == 405


class TestCost:
    def test_does_not_cost_more_queries_for_each_batch(self, auth_client, owner, farm):
        def count_for(n):
            batches = [make(farm, quantity=2) for _ in range(n)]
            for batch in batches:
                harvest(batch, 3)
                DiseaseDetectionFactory(batch=batch)
                SensorReadingFactory(batch=batch)
            with CaptureQueriesContext(connection) as queries:
                assert compare(auth_client(owner), *batches).status_code == 200
            return len(queries)

        two = count_for(2)
        four = count_for(4)
        # Each batch has its own readings to count (two queries), but nothing is looked up for each record or check.
        assert four - two <= 4, (two, four)


class TestOlderDatabase:
    """Some databases were built before Django and hold the batch dates without a time zone, so Django hands them back naive."""

    @pytest.fixture(autouse=True)
    def naive_batch_dates(self):
        # The test database is rolled back after each test, so the column goes back to what it was.
        with connection.cursor() as cursor:
            cursor.execute(
                'ALTER TABLE batches ALTER COLUMN "startDate" TYPE timestamp without time zone, '
                'ALTER COLUMN "expectedHarvestDate" TYPE timestamp without time zone'
            )

    def test_compares_batches_whose_dates_have_no_time_zone(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        start(a, 12)
        harvest(a, 4, days_after_start=10)
        response = compare(auth_client(owner), a, b)
        assert response.status_code == 200
        first = rows(response)[0]
        assert first['days_running'] == 12
        assert first['harvest']['curve'] == [{'day': 10, 'kg': 4.0}]

    def test_gives_the_dates_with_their_time_zone(self, auth_client, owner, farm):
        a, b = make(farm), make(farm)
        first = rows(compare(auth_client(owner), a, b))[0]
        assert first['start_date'].utcoffset() is not None
        assert first['expected_harvest_date'].utcoffset() is not None
