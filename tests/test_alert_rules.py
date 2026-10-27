"""One open alert per problem: a bad reading opens it, further bad readings add nothing, a good reading resolves it."""
from unittest import mock

import pytest

from alerts.models import AlertLog, StageThreshold
from alerts.utils import check_sensor_alerts
from batches.models import BatchStage
from tests.factories import BatchFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _no_email():
    with mock.patch('alerts.utils._send_mail_async') as sent:
        yield sent


def alerts_for(batch, type_=None):
    qs = AlertLog.objects.filter(batch=batch)
    return qs.filter(type=type_) if type_ else qs


def test_every_stage_starts_with_the_existing_safe_range():
    rows = {t.stage: t for t in StageThreshold.objects.all()}
    assert set(rows) == {stage.value for stage in BatchStage}
    for row in rows.values():
        assert (row.temp_min, row.temp_max, row.hum_min, row.hum_max) == (22.0, 28.0, 70.0, 85.0)


def test_a_reading_in_range_makes_no_alert():
    batch = BatchFactory()
    assert check_sensor_alerts(batch.pk, 25.0, 78.0) == []
    assert alerts_for(batch).count() == 0


def test_a_cold_reading_opens_one_temperature_alert():
    batch = BatchFactory()
    created = check_sensor_alerts(batch.pk, 20.5, 78.0)
    assert [a.type for a in created] == ['TEMPERATURE']
    alert = alerts_for(batch).get()
    assert 'Temperature too low: 20.5' in alert.message
    assert alert.resolved_at is None


def test_the_same_problem_again_does_not_open_a_second_alert():
    batch = BatchFactory()
    check_sensor_alerts(batch.pk, 20.5, 78.0)
    again = check_sensor_alerts(batch.pk, 20.1, 78.0)
    assert again == []
    assert alerts_for(batch, 'TEMPERATURE').count() == 1


def test_a_good_reading_resolves_the_open_alert():
    batch = BatchFactory()
    check_sensor_alerts(batch.pk, 20.5, 78.0)
    check_sensor_alerts(batch.pk, 24.0, 78.0)
    assert alerts_for(batch).get().resolved_at is not None


def test_a_new_problem_after_a_resolved_one_opens_a_new_alert():
    batch = BatchFactory()
    check_sensor_alerts(batch.pk, 20.5, 78.0)
    check_sensor_alerts(batch.pk, 24.0, 78.0)
    check_sensor_alerts(batch.pk, 29.5, 78.0)
    assert alerts_for(batch, 'TEMPERATURE').count() == 2
    assert alerts_for(batch, 'TEMPERATURE').filter(resolved_at__isnull=True).count() == 1


def test_temperature_and_humidity_are_tracked_separately():
    batch = BatchFactory()
    check_sensor_alerts(batch.pk, 20.5, 78.0)
    created = check_sensor_alerts(batch.pk, 20.5, 90.0)
    assert [a.type for a in created] == ['HUMIDITY']
    check_sensor_alerts(batch.pk, 24.0, 90.0)
    assert alerts_for(batch, 'TEMPERATURE').get().resolved_at is not None
    assert alerts_for(batch, 'HUMIDITY').get().resolved_at is None


def test_batches_do_not_resolve_each_others_alerts():
    first, second = BatchFactory(), BatchFactory()
    check_sensor_alerts(first.pk, 20.5, 78.0)
    check_sensor_alerts(second.pk, 24.0, 78.0)
    assert alerts_for(first).get().resolved_at is None


def test_each_stage_uses_its_own_range():
    StageThreshold.objects.filter(stage='LARVA').update(temp_min=26.0, temp_max=29.0)
    larva, egg = BatchFactory(stage='LARVA'), BatchFactory(stage='EGG')
    assert [a.type for a in check_sensor_alerts(larva.pk, 25.0, 78.0)] == ['TEMPERATURE']
    assert check_sensor_alerts(egg.pk, 25.0, 78.0) == []


def test_the_message_names_the_range_of_that_stage():
    StageThreshold.objects.filter(stage='PUPA').update(hum_min=60.0, hum_max=75.0)
    batch = BatchFactory(stage='PUPA')
    check_sensor_alerts(batch.pk, 25.0, 80.0)
    assert 'safe max is 75.0%' in alerts_for(batch).get().message


def test_one_email_goes_out_per_problem_not_per_reading(_no_email):
    batch = BatchFactory()
    check_sensor_alerts(batch.pk, 20.5, 78.0)
    check_sensor_alerts(batch.pk, 20.1, 78.0)
    check_sensor_alerts(batch.pk, 19.9, 78.0)
    assert _no_email.call_count == 1


def test_a_missing_threshold_row_falls_back_to_the_default_range():
    StageThreshold.objects.filter(stage='COCOON').delete()
    batch = BatchFactory(stage='COCOON')
    assert [a.type for a in check_sensor_alerts(batch.pk, 20.0, 78.0)] == ['TEMPERATURE']
