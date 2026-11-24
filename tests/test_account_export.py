"""A person downloads what SSMS holds about them: one JSON file, after giving their password.

The file holds the person's own records only: their profile, farms, rooms, batches, harvests, photo checks (the result and
the date, not the photo), allowance history, cooperative history and the security events about them. It holds no password
hash, no token, no photo address and nobody else's number or email.
"""
import json
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from cooperatives.models import CooperativeMembership
from core.doc_text import t
from farms.models import RearingRoom
from harvest.models import HarvestRecord
from logs.models import SecurityEvent
from supply import allowance
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, UserFactory
from tests.support_helpers import acting, admin_and_person
from users.export import build_export

pytestmark = pytest.mark.django_db

EXPORT = '/api/auth/export'
PASSWORD = 'Garden-Tree-4721'
KEYS = {'profile', 'farms', 'rooms', 'batches', 'harvests', 'detections', 'allowance', 'cooperatives', 'security_events', 'generated_at'}


@pytest.fixture
def coop():
    return CooperativeFactory(name='Old Coop')


@pytest.fixture
def farmer(coop):
    return UserFactory(email='aline@example.rw', phone='+250788000001', password=PASSWORD, cooperative=coop, name='Aline Uwase')


def download(client, password=PASSWORD):
    return client.post(EXPORT, {'password': password}, format='json')


def content(response) -> dict:
    return json.loads(response.content.decode('utf-8'))


def full_record(farmer, coop):
    """A farm with a room, a batch, a harvest and a detection, an allowance with a history and an old security event."""
    from sensors.models import DiseaseDetection

    farm = FarmFactory(owner=farmer, name='Hill Farm')
    room = RearingRoom.objects.create(farm=farm, name='Room A', area_m2=Decimal('20'))
    batch = BatchFactory(farm=farm, room=room, breed='Bivoltine')
    harvest = HarvestRecord.objects.create(batch=batch, cocoon_weight_kg=Decimal('12.5'), share_token='secret-share-token-value')
    detection = DiseaseDetection.objects.create(batch=batch, image_url='https://example.rw/photo.jpg', result='healthy', confidence=0.91)
    allowance.set_start(farmer, coop, 3, by=None)
    SecurityEvent.objects.create(kind='password_changed', user=farmer, user_email=farmer.email, detail='Changed in settings')
    return farm, room, batch, harvest, detection


# ── the password ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('password', ['', None, 'wrong-password-1'])
def test_the_password_is_required_and_a_wrong_one_is_refused(jwt_client, farmer, password):
    response = download(jwt_client(farmer), password=password)
    assert response.status_code == 422
    assert response.json()['code'] == 'wrong_password'
    assert response.json()['errors']['password'][0] == t('en', 'erWrongPassword')
    assert not SecurityEvent.objects.filter(kind='data_exported').exists()


def test_only_a_post_is_allowed_so_the_password_is_never_in_an_address(jwt_client, farmer):
    assert jwt_client(farmer).get(EXPORT).status_code == 405


# ── what is in the file ──────────────────────────────────────────────────────────────────────

def test_it_has_every_listed_key_and_no_password_hash_token_or_other_persons_number(jwt_client, farmer, coop):
    farm, room, batch, harvest, detection = full_record(farmer, coop)
    other = UserFactory(email='bruce@example.rw', phone='+250788000002')
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop, phone='+250722000111', email='claire@example.rw')
    response = download(jwt_client(farmer))
    assert response.status_code == 200
    data = content(response)
    assert set(data) == KEYS
    text = response.content.decode('utf-8')
    for secret in (farmer.password, 'secret-share-token-value', 'https://example.rw/photo.jpg', other.phone, other.email, supervisor.phone, supervisor.email):
        assert secret not in text, secret
    assert data['profile']['email'] == 'aline@example.rw' and data['profile']['phone'] == '+250788000001'
    assert [f['id'] for f in data['farms']] == [farm.pk]
    assert [r['id'] for r in data['rooms']] == [room.pk]
    assert [b['id'] for b in data['batches']] == [batch.pk]
    assert [h['batch_id'] for h in data['harvests']] == [batch.pk]
    assert data['harvests'][0]['cocoon_weight_kg'] == '12.50'
    assert [d['id'] for d in data['detections']] == [detection.pk]
    assert data['detections'][0]['result'] == 'healthy' and 'image_url' not in data['detections'][0]
    assert data['allowance']['boxes'] == 3 and data['allowance']['history'][0]['new_boxes'] == 3
    assert data['cooperatives'][0]['cooperative'] == 'Old Coop' and data['cooperatives'][0]['ended_at'] is None
    assert data['security_events'][0]['kind'] == 'password_changed'


def test_the_file_holds_only_the_persons_own_records(jwt_client, farmer, coop):
    full_record(farmer, coop)
    other = UserFactory(cooperative=coop)
    other_farm = FarmFactory(owner=other, name='Other Farm')
    other_room = RearingRoom.objects.create(farm=other_farm, name='Other Room', area_m2=Decimal('10'))
    other_batch = BatchFactory(farm=other_farm, room=other_room)
    HarvestRecord.objects.create(batch=other_batch, cocoon_weight_kg=Decimal('99'))
    SecurityEvent.objects.create(kind='password_changed', user=other, user_email=other.email)
    data = content(download(jwt_client(farmer)))
    assert [f['name'] for f in data['farms']] == ['Hill Farm']
    assert other_room.pk not in [r['id'] for r in data['rooms']]
    assert other_batch.pk not in [b['id'] for b in data['batches']]
    assert len(data['harvests']) == 1
    assert len(data['security_events']) == 1


def test_a_supervisor_gets_their_own_profile_and_history_and_no_farms_of_their_cooperative(jwt_client, coop):
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop, password=PASSWORD)
    FarmFactory(owner=UserFactory(cooperative=coop), name='Member Farm')
    data = content(download(jwt_client(supervisor)))
    assert set(data) == KEYS
    assert data['farms'] == [] and data['batches'] == []
    assert data['profile']['role'] == 'SUPERVISOR'


def test_deleted_records_are_in_the_file_marked_as_such(jwt_client, farmer, coop):
    farm, room, batch, harvest, detection = full_record(farmer, coop)
    type(farm).objects.filter(pk=farm.pk).update(is_active=False)
    data = content(download(jwt_client(farmer)))
    assert data['farms'][0]['is_active'] is False


def test_security_events_are_the_last_180_days_with_emails_masked(jwt_client, farmer):
    old = SecurityEvent.objects.create(kind='login_failed', user=farmer, user_email=farmer.email, detail='old')
    SecurityEvent.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=181))
    SecurityEvent.objects.create(kind='email_changed', user=farmer, user_email=farmer.email, detail='aline@example.rw to n***@example.rw')
    data = content(download(jwt_client(farmer)))
    details = [e['detail'] for e in data['security_events']]
    assert 'old' not in details
    assert details == ['a***@example.rw to n***@example.rw']
    assert 'aline@example.rw' not in json.dumps(data['security_events'])


def test_an_old_cooperative_stays_in_the_history(jwt_client, farmer, coop):
    other = CooperativeFactory(name='New Coop')
    farmer.cooperative = other
    farmer.save(update_fields=['cooperative'])
    rows = content(download(jwt_client(farmer)))['cooperatives']
    assert [(r['cooperative'], r['ended_at'] is None) for r in rows] == [('Old Coop', False), ('New Coop', True)]
    assert CooperativeMembership.objects.filter(user=farmer).count() == 2


def test_build_export_is_plain_data_a_person_can_read_back(farmer):
    data = build_export(farmer)
    assert set(data) == KEYS
    json.dumps(data, default=str)


# ── the file ─────────────────────────────────────────────────────────────────────────────────

def test_it_is_an_attachment_with_a_dated_name(jwt_client, farmer):
    response = download(jwt_client(farmer))
    assert response['Content-Type'].startswith('application/json')
    assert response['Content-Disposition'] == f'attachment; filename="ssms-my-data-{timezone.now().date().isoformat()}.json"'
    assert response['Cache-Control'] == 'no-store'


# ── the throttle, the log and the other ways in ─────────────────────────────────────────────

@pytest.mark.throttle
def test_it_is_throttled_to_three_an_hour(jwt_client, farmer):
    client = jwt_client(farmer)
    assert [download(client).status_code for _ in range(3)] == [200, 200, 200]
    blocked = download(client)
    assert blocked.status_code == 429
    assert blocked.json()['retryAfter'] >= 1


def test_the_rate_is_three_an_hour():
    from django.conf import settings

    from core.throttles import AccountExportThrottle, UserRateThrottle
    assert settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['account_export'] == '3/hour'
    assert AccountExportThrottle.scope == 'account_export' and issubclass(AccountExportThrottle, UserRateThrottle)


def test_it_writes_a_security_event_without_the_content(jwt_client, farmer, coop):
    full_record(farmer, coop)
    download(jwt_client(farmer))
    event = SecurityEvent.objects.get(kind='data_exported')
    assert event.user_id == farmer.pk
    assert 'Hill Farm' not in event.detail and farmer.email not in event.detail and farmer.phone not in event.detail


def test_support_access_cannot_use_it():
    admin, person = admin_and_person()
    token, _ = acting(admin, person)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    response = download(client)
    assert response.status_code == 403
    assert response.json()['code'] == 'support_blocked'


def test_a_scheduled_account_cannot_use_it(jwt_client, farmer):
    type(farmer).objects.filter(pk=farmer.pk).update(deletion_requested_at=timezone.now())
    response = download(jwt_client(farmer))
    assert response.status_code == 403
    assert response.json()['code'] == 'deletion_scheduled'


def test_a_visitor_with_no_sign_in_is_refused():
    assert APIClient().post(EXPORT, {'password': PASSWORD}, format='json').status_code == 401


# ── masking an email in a line of the log ───────────────────────────────────────────────────

def test_masking_hides_each_email_and_leaves_the_rest_of_the_line():
    from users.export import _masked
    assert _masked('aline@example.rw to n***@example.rw, again aline@example.rw.') == 'a***@example.rw to n***@example.rw, again a***@example.rw.'
    assert _masked('Changed in settings') == 'Changed in settings'
    assert _masked('') == '' and _masked(None) == ''


LONG = {
    'pluses': lambda: '+' * 40000,
    'pluses then at': lambda: 'a' + '+' * 40000 + '@',
    'dashes after at': lambda: 'a@' + '-' * 40000,
    'many dots': lambda: 'a@b' + '.b' * 20000 + '!',
}


@pytest.mark.parametrize('kind', sorted(LONG))
def test_masking_is_quick_on_a_line_built_to_make_a_pattern_slow(kind):
    import time
    from users.export import _masked
    line = LONG[kind]()
    started = time.perf_counter()
    _masked(line)
    assert time.perf_counter() - started < 0.5
