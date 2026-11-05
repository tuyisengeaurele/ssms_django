"""The API is pinged only in working hours, so the free host can sleep at night and its 750 monthly hours last."""
from datetime import datetime, timezone
from unittest import mock

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from logs.management.commands.run_health_checks import in_awake_window

pytestmark = pytest.mark.django_db
COMMAND = 'logs.management.commands.run_health_checks'


def run_at(hour, *extra):
    at = datetime(2026, 11, 5, hour, 30, tzinfo=timezone.utc)
    with mock.patch(f'{COMMAND}.timezone.now', return_value=at), \
         mock.patch(f'{COMMAND}.run_checks', return_value={'checks': []}) as run:
        call_command('run_health_checks', '--skip', 'aiService', *extra)
    return run.call_args.kwargs['skip']


@pytest.mark.parametrize('hour,outside', [(3, True), (4, False), (12, False), (17, False), (18, True), (0, True), (23, True)])
def test_the_api_is_pinged_only_inside_the_awake_window(hour, outside):
    skip = run_at(hour, '--awake-hours-utc', '4-18')
    assert ('web' in skip) is outside
    assert 'aiService' in skip


def test_without_a_window_the_api_is_always_checked():
    assert 'web' not in run_at(2)


@pytest.mark.parametrize('hour,inside', [(23, True), (0, True), (5, True), (6, False), (12, False), (21, False)])
def test_a_window_may_wrap_midnight(hour, inside):
    assert in_awake_window('22-6', hour) is inside


@pytest.mark.parametrize('bad', ['4', '4-', '-18', 'a-b', '24-3', '4-24', '4-4', '', '4-18-20'])
def test_a_broken_window_stops_the_command_instead_of_checking_everything(bad):
    with pytest.raises(CommandError):
        run_at(10, '--awake-hours-utc', bad)
