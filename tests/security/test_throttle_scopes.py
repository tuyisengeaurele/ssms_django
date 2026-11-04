"""Reports, exports and photo checks cost the server real work, so each person gets a small allowance of them."""
import pytest
from django.conf import settings as django_settings

from core import throttles
from tests.factories import BatchFactory, FarmFactory, UserFactory

pytestmark = [pytest.mark.django_db, pytest.mark.throttle]

AUDIT_EXPORT = '/api/admin/audit-log?export=csv'
AUDIT_LIST = '/api/admin/audit-log'
DETECTIONS = '/api/detections'


@pytest.fixture
def tight(monkeypatch):
    """Three a minute instead of twenty, so a test does not have to make the server write twenty PDFs."""
    def set_rate(throttle):
        monkeypatch.setattr(throttle, 'rate', '3/minute', raising=False)
    return set_rate


def mine():
    owner = UserFactory(role='FARMER')
    return owner, BatchFactory(farm=FarmFactory(owner=owner))


def rates():
    return django_settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']


def test_the_allowances_are_the_ones_we_decided():
    assert rates()['report'] == '20/minute'
    assert rates()['export'] == '10/minute'
    assert rates()['detection'] == '20/minute'


def test_the_fourth_batch_report_in_a_minute_is_refused_with_a_wait_time(auth_client, tight):
    tight(throttles.ReportRateThrottle)
    owner, batch = mine()
    client = auth_client(owner)
    codes = [client.get(f'/api/batches/{batch.pk}/report').status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    refused = client.get(f'/api/batches/{batch.pk}/report')
    assert int(refused['Retry-After']) >= 1
    assert 'Too many' in refused.json()['message']


def test_a_farm_summary_shares_the_report_allowance(auth_client, tight):
    tight(throttles.ReportRateThrottle)
    owner, batch = mine()
    client = auth_client(owner)
    for _ in range(3):
        client.get(f'/api/farms/{batch.farm_id}/summary')
    assert client.get(f'/api/batches/{batch.pk}/report').status_code == 429


def test_another_person_is_not_slowed_down_by_my_reports(auth_client, tight):
    tight(throttles.ReportRateThrottle)
    owner, batch = mine()
    other_owner, other_batch = mine()
    for _ in range(4):
        auth_client(owner).get(f'/api/batches/{batch.pk}/report')
    assert auth_client(owner).get(f'/api/batches/{batch.pk}/report').status_code == 429
    assert auth_client(other_owner).get(f'/api/batches/{other_batch.pk}/report').status_code == 200


def test_only_an_export_counts_against_the_export_allowance(auth_client, tight):
    tight(throttles.ExportRateThrottle)
    admin = UserFactory(role='ADMIN')
    client = auth_client(admin)
    assert [client.get(AUDIT_LIST).status_code for _ in range(6)] == [200] * 6
    codes = [client.get(AUDIT_EXPORT).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    assert client.get(AUDIT_LIST).status_code == 200


def test_exports_and_reports_have_separate_allowances(auth_client, tight):
    tight(throttles.ExportRateThrottle)
    tight(throttles.ReportRateThrottle)
    owner, batch = mine()
    admin = UserFactory(role='ADMIN')
    for _ in range(4):
        auth_client(admin).get(AUDIT_EXPORT)
    assert auth_client(admin).get(AUDIT_EXPORT).status_code == 429
    assert auth_client(owner).get(f'/api/batches/{batch.pk}/report').status_code == 200


def test_the_fourth_photo_check_in_a_minute_is_refused_before_the_photo_is_read(auth_client, tight):
    tight(throttles.DetectionRateThrottle)
    owner, _ = mine()
    client = auth_client(owner)
    # No photo is sent, so every call would be a 400 if the allowance did not stop it first.
    codes = [client.post(DETECTIONS, {}, format='multipart').status_code for _ in range(4)]
    assert codes == [400, 400, 400, 429]


def test_a_device_sending_readings_is_not_counted_against_a_person(auth_client):
    from sensors.views import DeviceIngestView  # the view that devices post to with their key
    names = {cls.__name__ for cls in DeviceIngestView.throttle_classes}
    assert names.isdisjoint({'ReportRateThrottle', 'ExportRateThrottle', 'DetectionRateThrottle', 'UserRateThrottle'})
    assert 'DeviceKeyThrottle' in names
