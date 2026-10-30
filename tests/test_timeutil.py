"""Dates that a database may hand back without a time zone."""
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone

import pytest
from django.utils import timezone

from core.timeutil import aware


def test_a_naive_date_is_taken_as_utc():
    result = aware(datetime(2026, 10, 30, 7, 15, 0))
    assert result == datetime(2026, 10, 30, 7, 15, 0, tzinfo=dt_timezone.utc)
    assert result.utcoffset() == timedelta(0)


def test_a_date_that_has_a_time_zone_is_left_as_it_is():
    moment = datetime(2026, 10, 30, 9, 15, tzinfo=dt_timezone(timedelta(hours=2)))
    assert aware(moment) is moment


def test_nothing_stays_nothing():
    assert aware(None) is None


def test_the_result_can_be_taken_away_from_the_current_time():
    assert (timezone.now() - aware(datetime(2026, 1, 1))).days > 0


@pytest.mark.parametrize('moment', [datetime(2026, 3, 29, 1, 30), datetime(2026, 10, 25, 2, 30), datetime(2026, 12, 31, 23, 59, 59, 999999)])
def test_a_naive_date_keeps_its_wall_clock_time(moment):
    assert aware(moment).replace(tzinfo=None) == moment
