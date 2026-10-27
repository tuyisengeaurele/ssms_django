"""Marking an alert read can be undone, with the same access rules as marking it read."""
import pytest

from alerts.models import AlertLog
from tests.factories import AlertLogFactory, BatchFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


def make_alert(owner, **kwargs):
    batch = BatchFactory(farm=FarmFactory(owner=owner))
    return AlertLogFactory(batch=batch, **kwargs)


def test_an_owner_can_mark_a_read_alert_unread_again(auth_client):
    owner = UserFactory(role='FARMER')
    alert = make_alert(owner, is_read=True)
    response = auth_client(owner).patch(f'/api/alerts/{alert.pk}/unread', {}, format='json')
    assert response.status_code == 200
    assert response.json()['message'] == 'Alert marked as unread.'
    assert response.json()['data']['isRead'] is False
    alert.refresh_from_db()
    assert alert.is_read is False


def test_marking_an_unread_alert_unread_changes_nothing(auth_client):
    owner = UserFactory(role='FARMER')
    alert = make_alert(owner, is_read=False)
    assert auth_client(owner).patch(f'/api/alerts/{alert.pk}/unread', {}, format='json').status_code == 200
    assert AlertLog.objects.get(pk=alert.pk).is_read is False


def test_another_farmer_cannot_touch_it(auth_client):
    alert = make_alert(UserFactory(role='FARMER'), is_read=True)
    response = auth_client(UserFactory(role='FARMER')).patch(f'/api/alerts/{alert.pk}/unread', {}, format='json')
    assert response.status_code == 404
    assert AlertLog.objects.get(pk=alert.pk).is_read is True


def test_signing_in_is_required(api_client):
    alert = make_alert(UserFactory(role='FARMER'), is_read=True)
    assert api_client.patch(f'/api/alerts/{alert.pk}/unread', {}, format='json').status_code == 401
