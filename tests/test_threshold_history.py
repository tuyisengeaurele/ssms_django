"""A safe range remembers who last changed it and when. Only an admin is told."""
import pytest

from alerts.models import StageThreshold
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

URL = '/api/alerts/thresholds'
GOOD = {'tempMin': 24.0, 'tempMax': 27.0, 'humMin': 65.0, 'humMax': 80.0}


@pytest.fixture
def admin():
    return UserFactory(role='ADMIN', name='Aline Uwase')


def rows(client):
    return {r['stage']: r for r in client.get(URL).json()['data']}


def test_a_range_nobody_changed_has_no_author_and_no_date(auth_client, admin):
    row = rows(auth_client(admin))['EGG']
    assert row['updatedBy'] is None and row['updatedAt'] is None


def test_a_change_records_the_admin_and_the_time(auth_client, admin):
    client = auth_client(admin)
    response = client.put(f'{URL}/LARVA', GOOD, format='json')
    data = response.json()['data']
    assert data['updatedBy'] == {'id': admin.pk, 'name': 'Aline Uwase'} and data['updatedAt']
    row = rows(client)['LARVA']
    assert row['updatedBy']['name'] == 'Aline Uwase' and row['updatedAt']


def test_only_the_stage_that_changed_has_an_author(auth_client, admin):
    client = auth_client(admin)
    client.put(f'{URL}/LARVA', GOOD, format='json')
    found = rows(client)
    assert found['LARVA']['updatedBy'] is not None
    assert all(found[stage]['updatedBy'] is None for stage in ('EGG', 'PUPA', 'COCOON', 'HARVEST'))


def test_a_second_admin_takes_over_the_record(auth_client, admin):
    auth_client(admin).put(f'{URL}/LARVA', GOOD, format='json')
    other = UserFactory(role='ADMIN', name='Eric Niyonzima')
    auth_client(other).put(f'{URL}/LARVA', {**GOOD, 'tempMax': 26.0}, format='json')
    assert rows(auth_client(admin))['LARVA']['updatedBy']['name'] == 'Eric Niyonzima'


def test_a_refused_change_leaves_the_record_alone(auth_client, admin):
    client = auth_client(admin)
    response = client.put(f'{URL}/LARVA', {**GOOD, 'tempMin': 30.0}, format='json')
    assert response.status_code == 422
    assert rows(client)['LARVA']['updatedBy'] is None


@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR'])
def test_a_farmer_or_supervisor_is_not_told_who_changed_a_range(auth_client, admin, role):
    auth_client(admin).put(f'{URL}/LARVA', GOOD, format='json')
    row = rows(auth_client(UserFactory(role=role)))['LARVA']
    assert 'updatedBy' not in row and 'updatedAt' not in row
    assert row == {'stage': 'LARVA', 'tempMin': 24.0, 'tempMax': 27.0, 'humMin': 65.0, 'humMax': 80.0}


def test_the_name_of_an_admin_never_reaches_a_farmer_in_the_ranges(auth_client, admin):
    auth_client(admin).put(f'{URL}/LARVA', GOOD, format='json')
    body = auth_client(UserFactory(role='FARMER')).get(URL).content.decode()
    assert 'Aline Uwase' not in body


def test_deleting_the_admin_keeps_the_range(auth_client, admin):
    auth_client(admin).put(f'{URL}/LARVA', GOOD, format='json')
    admin.delete()
    row = StageThreshold.objects.get(stage='LARVA')
    assert row.updated_by is None and row.temp_min == 24.0
