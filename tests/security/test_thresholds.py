"""Anyone signed in may read the safe ranges. Only an admin may change them."""
import pytest

from alerts.models import StageThreshold
from audit_log.models import AuditLog
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

URL = '/api/alerts/thresholds'
GOOD = {'tempMin': 24.0, 'tempMax': 27.0, 'humMin': 65.0, 'humMax': 80.0}


@pytest.fixture
def admin_client(auth_client):
    return auth_client(UserFactory(role='ADMIN'))


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR', 'ADMIN'])
def test_everyone_signed_in_can_read_the_ranges_in_stage_order(auth_client, role):
    response = auth_client(UserFactory(role=role)).get(URL)
    assert response.status_code == 200
    rows = response.json()['data']
    assert [r['stage'] for r in rows] == ['EGG', 'LARVA', 'PUPA', 'COCOON', 'HARVEST']
    expected = {'stage': 'EGG', 'tempMin': 22.0, 'tempMax': 28.0, 'humMin': 70.0, 'humMax': 85.0}
    if role == 'ADMIN':
        # An admin is also told who last changed a range. Nobody has yet.
        expected |= {'updatedAt': None, 'updatedBy': None}
    assert rows[0] == expected


def test_signing_in_is_required_to_read(api_client):
    assert api_client.get(URL).status_code == 401


def test_an_admin_changes_one_stage_and_the_others_stay(admin_client):
    response = admin_client.put(f'{URL}/LARVA', GOOD, format='json')
    assert response.status_code == 200
    assert response.json()['message'] == 'Safe range updated.'
    assert response.json()['data']['tempMin'] == 24.0
    larva = StageThreshold.objects.get(stage='LARVA')
    assert (larva.temp_min, larva.temp_max, larva.hum_min, larva.hum_max) == (24.0, 27.0, 65.0, 80.0)
    assert StageThreshold.objects.get(stage='EGG').temp_min == 22.0


def test_changing_a_range_is_audited(admin_client):
    admin_client.put(f'{URL}/PUPA', GOOD, format='json')
    entry = AuditLog.objects.get(action='UPDATE', resource='Threshold')
    assert 'PUPA' in entry.detail


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_only_admins_may_change_a_range(auth_client, role):
    response = auth_client(UserFactory(role=role)).put(f'{URL}/LARVA', GOOD, format='json')
    assert response.status_code == 403
    assert StageThreshold.objects.get(stage='LARVA').temp_min == 22.0


def test_signing_in_is_required_to_change(api_client):
    assert api_client.put(f'{URL}/LARVA', GOOD, format='json').status_code == 401


def test_an_unknown_stage_is_a_plain_404(admin_client):
    response = admin_client.put(f'{URL}/FLYING', GOOD, format='json')
    assert response.status_code == 404
    assert response.json()['message'] == "We couldn't find that stage."


@pytest.mark.parametrize('bad', [
    {'tempMin': 28.0, 'tempMax': 22.0},
    {'tempMin': 25.0, 'tempMax': 25.0},
    {'humMin': 90.0, 'humMax': 70.0},
    {'tempMin': -5.0},
    {'tempMax': 80.0},
    {'humMin': -1.0},
    {'humMax': 120.0},
    {'tempMin': 'warm'},
])
def test_a_range_that_makes_no_sense_is_refused_and_nothing_changes(admin_client, bad):
    response = admin_client.put(f'{URL}/LARVA', {**GOOD, **bad}, format='json')
    assert response.status_code == 422
    assert StageThreshold.objects.get(stage='LARVA').temp_min == 22.0


def test_all_four_numbers_are_needed(admin_client):
    assert admin_client.put(f'{URL}/LARVA', {'tempMin': 24.0}, format='json').status_code == 422
