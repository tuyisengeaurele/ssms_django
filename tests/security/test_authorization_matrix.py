"""Every endpoint against every kind of caller.

One row per endpoint. For each row the test sends the request as all ten actors, rolls the change
back, and compares the status with the table. Reading the table is the quickest way to see the rules:

* not signed in, or a deactivated account: 401
* wrong role for the endpoint: 403 (this is checked before anything else)
* right role but the record is outside the caller's scope, or deleted: 404
"""
import io
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Callable
from unittest import mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from alerts.models import AlertLog
from tests.security.world import ACTORS, FARMERS, SCOPE, SUPERVISORS

pytestmark = pytest.mark.django_db


def _png():
    buffer = io.BytesIO()
    Image.new('RGB', (4, 4), (20, 120, 60)).save(buffer, 'PNG')
    return buffer.getvalue()

OWNER_SIDE = {'farmer_owner', 'supervisor_a', 'admin'}
STAFF_ONLY_DENIED = [*FARMERS, *SUPERVISORS]
PNG = _png()


def expect(allowed, *, role_denied=(), allowed_code=200, denied_code=404, role_code=403):
    table = {}
    for actor in ACTORS:
        if actor in ('anonymous', 'inactive_farmer'):
            table[actor] = 401
        elif actor in allowed:
            table[actor] = allowed_code
        elif actor in role_denied:
            table[actor] = role_code
        else:
            table[actor] = denied_code
    return table


NOBODY = set()


@dataclass
class Row:
    name: str
    method: str
    url: Callable
    expected: dict
    body: Callable = field(default=lambda w: None)
    fmt: str = 'json'


def reading_row(name, url):
    return Row(name, 'GET', url, expect(OWNER_SIDE))


def gone_row(name, url):
    return Row(name, 'GET', url, expect(NOBODY))


FARMER_WRITE_DENIED = SUPERVISORS  # supervisors are refused on role before scope is even looked at

ROWS = [
    # ── reading something that hangs off a batch or farm ──────────────────────────────────────
    reading_row('batch detail', lambda w: f'/api/batches/{w.batch.pk}'),
    reading_row('batches of a farm', lambda w: f'/api/batches/farm/{w.farm.pk}'),
    reading_row('farm detail', lambda w: f'/api/farms/{w.farm.pk}'),
    reading_row('readings of a batch', lambda w: f'/api/sensors/batch/{w.batch.pk}'),
    reading_row('readings of a batch over time', lambda w: f'/api/sensors/batch/{w.batch.pk}/series'),
    reading_row('detections of a batch', lambda w: f'/api/detections/batch/{w.batch.pk}'),
    reading_row('alerts of a batch', lambda w: f'/api/alerts/batch/{w.batch.pk}'),
    reading_row('harvest of a batch', lambda w: f'/api/harvest/batch/{w.batch.pk}'),
    reading_row('rooms of a farm', lambda w: f'/api/farms/{w.farm.pk}/rooms'),
    reading_row('deaths log of a batch', lambda w: f'/api/batches/{w.batch.pk}/mortality'),
    reading_row('device detail', lambda w: f'/api/devices/{w.device.pk}'),

    # ── the same, for deleted things: invisible to everybody, admin included ──────────────────
    gone_row('deleted batch detail', lambda w: f'/api/batches/{w.dead_batch.pk}'),
    gone_row('deleted batch readings', lambda w: f'/api/sensors/batch/{w.dead_batch.pk}'),
    gone_row('deleted batch detections', lambda w: f'/api/detections/batch/{w.dead_batch.pk}'),
    gone_row('deleted batch alerts', lambda w: f'/api/alerts/batch/{w.dead_batch.pk}'),
    gone_row('deleted batch harvest', lambda w: f'/api/harvest/batch/{w.dead_batch.pk}'),
    gone_row('deleted batch deaths log', lambda w: f'/api/batches/{w.dead_batch.pk}/mortality'),
    gone_row('deleted farm detail', lambda w: f'/api/farms/{w.dead_farm.pk}'),
    gone_row('rooms of a deleted farm', lambda w: f'/api/farms/{w.dead_farm.pk}/rooms'),
    gone_row('deleted farm batches', lambda w: f'/api/batches/farm/{w.dead_farm.pk}'),
    gone_row('batch inside a deleted farm', lambda w: f'/api/batches/{w.dead_farm_batch.pk}'),
    gone_row('readings inside a deleted farm', lambda w: f'/api/sensors/batch/{w.dead_farm_batch.pk}'),
    gone_row('detections inside a deleted farm', lambda w: f'/api/detections/batch/{w.dead_farm_batch.pk}'),
    gone_row('alerts inside a deleted farm', lambda w: f'/api/alerts/batch/{w.dead_farm_batch.pk}'),
    gone_row('harvest inside a deleted farm', lambda w: f'/api/harvest/batch/{w.dead_farm_batch.pk}'),
    gone_row('device inside a deleted farm', lambda w: f'/api/devices/{w.dead_farm_records.device.pk}'),

    # ── changes only farmers and admins may make ──────────────────────────────────────────────
    Row('create a batch', 'POST', lambda w: '/api/batches',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED, allowed_code=201),
        body=lambda w: {'farmId': w.farm.pk, 'roomId': w.room_1.pk, 'expectedHarvestDate': (timezone.now() + timedelta(days=30)).isoformat()}),
    Row('move a batch to the next stage', 'PATCH', lambda w: f'/api/batches/{w.batch.pk}/stage',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED), body=lambda w: {'stage': 'LARVA'}),
    Row('add a room to a farm', 'POST', lambda w: f'/api/farms/{w.farm.pk}/rooms',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED, allowed_code=201), body=lambda w: {'name': 'Second room'}),
    Row('add a room to a deleted farm', 'POST', lambda w: f'/api/farms/{w.dead_farm.pk}/rooms',
        expect(NOBODY, role_denied=FARMER_WRITE_DENIED), body=lambda w: {'name': 'Nope'}),
    Row('move a batch to another room', 'POST', lambda w: f'/api/batches/{w.batch.pk}/room',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED), body=lambda w: {'roomId': w.room_2.pk}),
    Row('edit the details of a batch', 'PATCH', lambda w: f'/api/batches/{w.batch.pk}',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED), body=lambda w: {'breed': 'Local'}),
    Row('record deaths in a batch', 'POST', lambda w: f'/api/batches/{w.batch.pk}/mortality',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED, allowed_code=201), body=lambda w: {'count': 3}),
    Row('record deaths in a deleted batch', 'POST', lambda w: f'/api/batches/{w.dead_batch.pk}/mortality',
        expect(NOBODY, role_denied=FARMER_WRITE_DENIED), body=lambda w: {'count': 3}),
    Row('delete a batch', 'DELETE', lambda w: f'/api/batches/{w.batch.pk}',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED)),
    Row('edit a farm', 'PATCH', lambda w: f'/api/farms/{w.farm.pk}',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED), body=lambda w: {'name': 'Renamed'}),
    Row('delete a farm', 'DELETE', lambda w: f'/api/farms/{w.farm.pk}',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED)),
    Row('record a harvest', 'POST', lambda w: f'/api/harvest/batch/{w.batch.pk}',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED, allowed_code=201),
        body=lambda w: {'cocoonWeightKg': 5, 'qualityGrade': 'A'}),
    Row('delete a harvest record', 'DELETE', lambda w: f'/api/harvest/{w.harvest.pk}',
        expect({'farmer_owner', 'admin'}, role_denied=FARMER_WRITE_DENIED)),
    # Deleted things cannot be changed either.
    Row('stage of a deleted batch', 'PATCH', lambda w: f'/api/batches/{w.dead_batch.pk}/stage',
        expect(NOBODY, role_denied=FARMER_WRITE_DENIED), body=lambda w: {'stage': 'LARVA'}),
    Row('delete a deleted batch', 'DELETE', lambda w: f'/api/batches/{w.dead_batch.pk}',
        expect(NOBODY, role_denied=FARMER_WRITE_DENIED)),
    Row('edit a deleted farm', 'PATCH', lambda w: f'/api/farms/{w.dead_farm.pk}',
        expect(NOBODY, role_denied=FARMER_WRITE_DENIED), body=lambda w: {'name': 'Zombie'}),
    Row('harvest on a deleted batch', 'POST', lambda w: f'/api/harvest/batch/{w.dead_batch.pk}',
        expect(NOBODY, role_denied=FARMER_WRITE_DENIED), body=lambda w: {'cocoonWeightKg': 5, 'qualityGrade': 'A'}),
    Row('delete a harvest record of a deleted batch', 'DELETE',
        lambda w: f'/api/harvest/{w.dead_batch_records.harvest.pk}',
        expect(NOBODY, role_denied=FARMER_WRITE_DENIED)),

    # ── changes anyone with access to the batch may make ──────────────────────────────────────
    Row('add a sensor reading', 'POST', lambda w: '/api/sensors',
        expect(OWNER_SIDE, allowed_code=201),
        body=lambda w: {'batchId': w.batch.pk, 'temperature': 25, 'humidity': 80}),
    Row('add a reading to a deleted batch', 'POST', lambda w: '/api/sensors',
        expect(NOBODY), body=lambda w: {'batchId': w.dead_batch.pk, 'temperature': 25, 'humidity': 80}),
    Row('check a photo for disease', 'POST', lambda w: '/api/detections',
        expect(OWNER_SIDE, allowed_code=201), fmt='multipart',
        body=lambda w: {'batchId': w.batch.pk, 'image': SimpleUploadedFile('w.png', PNG, content_type='image/png')}),
    Row('check a photo on a deleted batch', 'POST', lambda w: '/api/detections',
        expect(NOBODY), fmt='multipart',
        body=lambda w: {'batchId': w.dead_batch.pk, 'image': SimpleUploadedFile('w.png', PNG, content_type='image/png')}),
    Row('mark one alert read', 'PATCH', lambda w: f'/api/alerts/{w.alert.pk}/read', expect(OWNER_SIDE)),
    Row('mark one alert unread', 'PATCH', lambda w: f'/api/alerts/{w.alert.pk}/unread', expect(OWNER_SIDE)),
    Row('mark an alert of a deleted batch read', 'PATCH',
        lambda w: f'/api/alerts/{w.dead_batch_records.alert.pk}/read', expect(NOBODY)),

    # ── devices: staff only, and only on farms they may see ───────────────────────────────────
    Row('register a device', 'POST', lambda w: '/api/devices',
        expect({'supervisor_a', 'admin'}, role_denied=FARMERS, allowed_code=201),
        body=lambda w: {'name': 'New sensor', 'farmId': w.farm.pk}),
    Row('remove a device', 'DELETE', lambda w: f'/api/devices/{w.device.pk}',
        expect({'supervisor_a', 'admin'}, role_denied=FARMERS)),

    # ── administration ────────────────────────────────────────────────────────────────────────
    Row('user list', 'GET', lambda w: '/api/admin/users', expect({'admin'}, role_denied=STAFF_ONLY_DENIED)),
    # ── a supervisor's team: each supervisor works on their own cooperative, an admin names one ──
    Row('make an invitation link', 'POST', lambda w: '/api/team/invitations',
        expect({'supervisor_a', 'supervisor_b', 'admin'}, role_denied=[*FARMERS, 'supervisor_no_coop'], allowed_code=201),
        body=lambda w: {'cooperativeId': w.coop_a.pk}),
    Row('list invitation links', 'GET', lambda w: f'/api/team/invitations?cooperativeId={w.coop_a.pk}',
        expect({'supervisor_a', 'supervisor_b', 'admin'}, role_denied=[*FARMERS, 'supervisor_no_coop'])),
    Row('list the farmers of a cooperative', 'GET', lambda w: f'/api/team/farmers?cooperativeId={w.coop_a.pk}',
        expect({'supervisor_a', 'supervisor_b', 'admin'}, role_denied=[*FARMERS, 'supervisor_no_coop'])),
    Row('remove a farmer of cooperative B', 'DELETE', lambda w: f"/api/team/farmers/{w.users['farmer_foreign'].pk}?cooperativeId={w.coop_b.pk}",
        expect({'supervisor_b', 'admin'}, role_denied=[*FARMERS, 'supervisor_no_coop'])),
    Row('restore a user', 'POST', lambda w: f"/api/admin/users/{w.users['farmer_no_coop'].pk}/restore",
        expect({'admin'}, role_denied=STAFF_ONLY_DENIED)),
    Row('restore a cooperative', 'POST', lambda w: f'/api/cooperatives/{w.coop_a.pk}/restore',
        expect({'admin'}, role_denied=STAFF_ONLY_DENIED)),
    Row('change a safe range', 'PUT', lambda w: '/api/alerts/thresholds/LARVA',
        expect({'admin'}, role_denied=STAFF_ONLY_DENIED),
        body=lambda w: {'tempMin': 23.0, 'tempMax': 27.0, 'humMin': 70.0, 'humMax': 85.0}),
    Row('audit log', 'GET', lambda w: '/api/admin/audit-log', expect({'admin'}, role_denied=STAFF_ONLY_DENIED)),
    Row('system report', 'GET', lambda w: '/api/admin/reports', expect({'admin'}, role_denied=STAFF_ONLY_DENIED)),
    Row('contact messages', 'GET', lambda w: '/api/admin/contacts', expect({'admin'}, role_denied=STAFF_ONLY_DENIED)),
    Row('create a cooperative', 'POST', lambda w: '/api/cooperatives',
        expect({'admin'}, role_denied=STAFF_ONLY_DENIED, allowed_code=201), body=lambda w: {'name': 'Brand new'}),
]


@pytest.fixture(autouse=True)
def _no_outside_world():
    """The AI service and Cloudinary are not part of the rules being tested."""
    answer = mock.MagicMock(status_code=200)
    answer.json.return_value = {'result': 'Healthy', 'confidence': 0.9, 'allScores': {}}
    client = mock.MagicMock()
    client.__enter__.return_value.post.return_value = answer
    with mock.patch('sensors.detection_views.httpx.Client', return_value=client), \
            mock.patch('sensors.detection_views._upload_to_cloudinary', return_value='https://example.invalid/w.jpg'):
        yield


@pytest.fixture
def client_for(auth_client, jwt_client):
    def make(world, actor):
        if actor == 'anonymous':
            return APIClient()
        user = world.users[actor]
        return jwt_client(user) if actor == 'inactive_farmer' else auth_client(user)

    return make


def send(client, row, world):
    call = getattr(client, row.method.lower())
    body = row.body(world)
    if body is None:
        return call(row.url(world))
    return call(row.url(world), body, format=row.fmt)


@pytest.mark.parametrize('row', ROWS, ids=lambda r: r.name)
def test_matrix(world, client_for, row):
    wrong = []
    for actor in ACTORS:
        savepoint = transaction.savepoint()
        try:
            got = send(client_for(world, actor), row, world).status_code
        finally:
            transaction.savepoint_rollback(savepoint)
        if got != row.expected[actor]:
            wrong.append(f'{actor}: expected {row.expected[actor]}, got {got}')
    assert not wrong, f'{row.method} {row.url(world)}\n  ' + '\n  '.join(wrong)


# ── list endpoints: each caller must get exactly the records in their scope ──────────────────

LISTS = [
    # name, url, attribute of a tenant that holds the record, roles refused
    ('farms', '/api/farms', 'farm', ()),
    ('active batches', '/api/batches/active', 'batch', ()),
    ('alerts', '/api/alerts?unread=false&limit=500', 'alert', ()),
    ('devices', '/api/devices', 'device', ()),
    ('harvest records', '/api/harvest', 'harvest', ()),
    ('detection history', '/api/detections/history', 'detection', ()),
    ('recent detections', '/api/detections/recent', 'detection', FARMERS),
]


@pytest.mark.parametrize('name, url, attr, refused', LISTS, ids=[row[0] for row in LISTS])
def test_lists_hold_exactly_what_the_caller_may_see(world, client_for, name, url, attr, refused):
    wrong = []
    for actor in ACTORS:
        response = client_for(world, actor).get(url)
        if actor in ('anonymous', 'inactive_farmer'):
            want_status, want_ids = 401, None
        elif actor in refused:
            want_status, want_ids = 403, None
        else:
            want_status = 200
            want_ids = {getattr(world.tenants[key], attr).pk for key in SCOPE[actor]}
        if response.status_code != want_status:
            wrong.append(f'{actor}: expected {want_status}, got {response.status_code}')
            continue
        if want_ids is not None:
            got_ids = {item['id'] for item in response.json()['data']}
            if got_ids != want_ids:
                wrong.append(f'{actor}: expected {len(want_ids)} record(s), got {len(got_ids)} (leak: {len(got_ids - want_ids)}, missing: {len(want_ids - got_ids)})')
    assert not wrong, f'GET {url}\n  ' + '\n  '.join(wrong)


def test_the_chart_only_averages_readings_the_caller_may_see(world, client_for):
    from tests.security.world import TEMPERATURES

    wrong = []
    for actor, keys in SCOPE.items():
        data = client_for(world, actor).get('/api/sensors/chart?hours=24').json()['data']
        if not keys:
            if data:
                wrong.append(f'{actor}: expected no readings, got {data}')
            continue
        want = round(sum(TEMPERATURES[k] for k in keys) / len(keys), 1)
        got = [row['avgTemp'] for row in data]
        if got != [want]:
            wrong.append(f'{actor}: expected average {want}, got {got}')
    assert not wrong, '\n  '.join(wrong)


def test_detection_and_harvest_totals_only_count_what_the_caller_may_see(world, client_for):
    wrong = []
    for actor, keys in SCOPE.items():
        client = client_for(world, actor)
        counted = sum(row['count'] for row in client.get('/api/detections/stats').json()['data'])
        harvested = client.get('/api/harvest/stats').json()['data']['recordCount']
        if counted != len(keys) or harvested != len(keys):
            wrong.append(f'{actor}: expected {len(keys)} each, got detections={counted}, harvest={harvested}')
    assert not wrong, '\n  '.join(wrong)


def test_mark_all_read_only_touches_alerts_in_scope(world, client_for):
    wrong = []
    for actor in ('supervisor_a', 'supervisor_b', 'supervisor_no_coop', 'admin'):
        savepoint = transaction.savepoint()
        try:
            response = client_for(world, actor).post('/api/alerts/mark-all-read')
            read = {a.pk for a in AlertLog.objects.filter(is_read=True)}
        finally:
            transaction.savepoint_rollback(savepoint)
        want = {world.tenants[k].alert.pk for k in SCOPE[actor]}
        if response.status_code != 200:
            wrong.append(f'{actor}: expected 200, got {response.status_code}')
        elif read != want:
            wrong.append(f'{actor}: marked {len(read)} alert(s), expected {len(want)}')
    for actor, code in [*[(a, 403) for a in FARMERS], ('inactive_farmer', 401), ('anonymous', 401)]:
        got = client_for(world, actor).post('/api/alerts/mark-all-read').status_code
        if got != code:
            wrong.append(f'{actor}: expected {code}, got {got}')
    assert not wrong, '\n  '.join(wrong)
