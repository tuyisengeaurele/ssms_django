"""
Unit tests for alert logic:
  - AlertListView      (GET /api/alerts)
  - AlertMarkReadView  (PATCH /api/alerts/<pk>)
  - AlertMarkAllReadView (POST /api/alerts/mark-all-read)
  - AlertsByBatchView  (GET /api/alerts/batch/<batch_id>)
  - Role-based scoping: FARMER sees only own, SUPERVISOR sees only cooperative, ADMIN sees all
"""
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status

from django.contrib.auth import get_user_model
from cooperatives.models import Cooperative
from farms.models import Farm
from batches.models import Batch
from alerts.models import AlertLog, AlertType

User = get_user_model()

ALERTS_URL = '/api/alerts'
MARK_ALL_READ_URL = '/api/alerts/mark-all-read'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(email, role='FARMER', cooperative=None, password='Pass1234'):
    return User.objects.create_user(email=email, password=password, name=email, role=role, cooperative=cooperative)


def make_farm(owner):
    return Farm.objects.create(name=f'Farm-{owner.email}', location='Test Location', owner=owner)


def make_batch(farm):
    return Batch.objects.create(
        farm=farm,
        stage='EGG',
        expected_harvest_date=timezone.now() + timezone.timedelta(days=30),
    )


def make_alert(batch, alert_type=AlertType.SYSTEM, message='Test alert', is_read=False):
    return AlertLog.objects.create(batch=batch, type=alert_type, message=message, is_read=is_read)


# ---------------------------------------------------------------------------
# AlertListView — scoping
# ---------------------------------------------------------------------------

class AlertListScopingTests(APITestCase):

    def setUp(self):
        self.coop_a = Cooperative.objects.create(name='Coop A')
        self.coop_b = Cooperative.objects.create(name='Coop B')

        # FARMER users
        self.farmer_a = make_user('farmer_a@test.com', 'FARMER', cooperative=self.coop_a)
        self.farmer_b = make_user('farmer_b@test.com', 'FARMER', cooperative=self.coop_b)

        # SUPERVISOR for coop A
        self.supervisor_a = make_user('supervisor_a@test.com', 'SUPERVISOR', cooperative=self.coop_a)

        # ADMIN (no cooperative)
        self.admin = make_user('admin@test.com', 'ADMIN')

        # Farms & batches
        farm_a = make_farm(self.farmer_a)
        farm_b = make_farm(self.farmer_b)
        batch_a = make_batch(farm_a)
        batch_b = make_batch(farm_b)

        # 2 unread alerts for coop A's batch, 1 for coop B's
        self.alert_a1 = make_alert(batch_a, message='Alert A1')
        self.alert_a2 = make_alert(batch_a, message='Alert A2')
        self.alert_b1 = make_alert(batch_b, message='Alert B1')

    # -- FARMER scoping --

    def test_farmer_sees_only_own_alerts(self):
        self.client.force_authenticate(user=self.farmer_a)
        res = self.client.get(ALERTS_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [a['id'] for a in res.json()['data']]
        self.assertIn(self.alert_a1.id, ids)
        self.assertIn(self.alert_a2.id, ids)
        self.assertNotIn(self.alert_b1.id, ids)

    def test_farmer_b_sees_only_own_alerts(self):
        self.client.force_authenticate(user=self.farmer_b)
        res = self.client.get(ALERTS_URL)
        ids = [a['id'] for a in res.json()['data']]
        self.assertIn(self.alert_b1.id, ids)
        self.assertNotIn(self.alert_a1.id, ids)

    # -- SUPERVISOR cooperative scoping --

    def test_supervisor_sees_only_own_coop_alerts(self):
        self.client.force_authenticate(user=self.supervisor_a)
        res = self.client.get(ALERTS_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [a['id'] for a in res.json()['data']]
        self.assertIn(self.alert_a1.id, ids)
        self.assertIn(self.alert_a2.id, ids)
        self.assertNotIn(self.alert_b1.id, ids)

    def test_supervisor_without_cooperative_sees_nothing(self):
        sup_no_coop = make_user('sup_no_coop@test.com', 'SUPERVISOR', cooperative=None)
        self.client.force_authenticate(user=sup_no_coop)
        res = self.client.get(ALERTS_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.json()['data']), 0)

    # -- ADMIN sees everything --

    def test_admin_sees_all_alerts(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(ALERTS_URL)
        ids = [a['id'] for a in res.json()['data']]
        self.assertIn(self.alert_a1.id, ids)
        self.assertIn(self.alert_b1.id, ids)

    # -- Unread filter (default) --

    def test_unread_filter_default(self):
        """By default only unread alerts are returned."""
        self.alert_a1.is_read = True
        self.alert_a1.save()
        self.client.force_authenticate(user=self.farmer_a)
        res = self.client.get(ALERTS_URL)
        ids = [a['id'] for a in res.json()['data']]
        self.assertNotIn(self.alert_a1.id, ids)
        self.assertIn(self.alert_a2.id, ids)

    def test_unread_false_includes_read_alerts(self):
        self.alert_a1.is_read = True
        self.alert_a1.save()
        self.client.force_authenticate(user=self.farmer_a)
        res = self.client.get(ALERTS_URL + '?unread=false')
        ids = [a['id'] for a in res.json()['data']]
        self.assertIn(self.alert_a1.id, ids)

    # -- Unauthenticated --

    def test_unauthenticated_rejected(self):
        res = self.client.get(ALERTS_URL)
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


# ---------------------------------------------------------------------------
# AlertMarkReadView — PATCH /api/alerts/<pk>
# ---------------------------------------------------------------------------

class AlertMarkReadViewTests(APITestCase):

    def setUp(self):
        self.farmer = make_user('farmer_mark@test.com', 'FARMER')
        farm = make_farm(self.farmer)
        batch = make_batch(farm)
        self.alert = make_alert(batch, message='Mark me read')
        self.client.force_authenticate(user=self.farmer)

    def test_mark_alert_read(self):
        url = f'/api/alerts/{self.alert.id}/read'
        res = self.client.patch(url, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.alert.refresh_from_db()
        self.assertTrue(self.alert.is_read)

    def test_mark_nonexistent_alert(self):
        res = self.client.patch('/api/alerts/nonexistent-id/read', format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# AlertMarkAllReadView — POST /api/alerts/mark-all-read
# ---------------------------------------------------------------------------

class AlertMarkAllReadViewTests(APITestCase):

    def setUp(self):
        self.coop = Cooperative.objects.create(name='Coop Mark All')

        self.farmer = make_user('farmer_mall@test.com', 'FARMER', cooperative=self.coop)
        self.supervisor = make_user('supervisor_mall@test.com', 'SUPERVISOR', cooperative=self.coop)
        self.admin = make_user('admin_mall@test.com', 'ADMIN')

        farm = make_farm(self.farmer)
        batch = make_batch(farm)
        self.alert1 = make_alert(batch, message='Unread 1')
        self.alert2 = make_alert(batch, message='Unread 2')

    def test_admin_marks_all_read(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(MARK_ALL_READ_URL, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(AlertLog.objects.filter(is_read=False).count(), 0)

    def test_supervisor_marks_all_read_in_own_coop(self):
        # Create an alert outside this supervisor's coop
        other_farmer = make_user('other_farmer_mall@test.com', 'FARMER')
        other_farm = make_farm(other_farmer)
        other_batch = make_batch(other_farm)
        other_alert = make_alert(other_batch, message='Outside coop')

        self.client.force_authenticate(user=self.supervisor)
        res = self.client.post(MARK_ALL_READ_URL, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Alerts inside coop are marked read
        self.alert1.refresh_from_db()
        self.assertTrue(self.alert1.is_read)
        # Alert outside coop is untouched
        other_alert.refresh_from_db()
        self.assertFalse(other_alert.is_read)

    def test_farmer_forbidden_from_mark_all_read(self):
        """FARMER role should not be allowed to call mark-all-read."""
        self.client.force_authenticate(user=self.farmer)
        res = self.client.post(MARK_ALL_READ_URL, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# AlertsByBatchView — GET /api/alerts/batch/<batch_id>
# ---------------------------------------------------------------------------

class AlertsByBatchViewTests(APITestCase):

    def setUp(self):
        self.farmer = make_user('farmer_batch@test.com', 'FARMER')
        farm = make_farm(self.farmer)
        self.batch = make_batch(farm)
        self.alert = make_alert(self.batch, message='Batch alert')
        self.client.force_authenticate(user=self.farmer)

    def test_get_alerts_for_batch(self):
        res = self.client.get(f'/api/alerts/batch/{self.batch.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()['data']
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['id'], self.alert.id)

    def test_get_alerts_nonexistent_batch(self):
        res = self.client.get('/api/alerts/batch/nonexistent-id')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
