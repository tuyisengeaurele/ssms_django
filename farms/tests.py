"""
Unit tests for cooperative scoping:
  - FarmListCreateView  (GET /api/farms, POST /api/farms)
  - FarmDetailView      (GET /api/farms/<id>)
  - BatchListCreateView (GET /api/batches?farm_id=...)
  Verify FARMER, SUPERVISOR, and ADMIN visibility rules.
"""
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status

from django.contrib.auth import get_user_model
from cooperatives.models import Cooperative
from farms.models import Farm
from batches.models import Batch

User = get_user_model()

FARMS_URL   = '/api/farms'
BATCHES_URL = '/api/batches'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(email, role='FARMER', cooperative=None, password='Pass1234'):
    return User.objects.create_user(email=email, password=password, name=email, role=role, cooperative=cooperative)


def make_farm(owner, name=None):
    return Farm.objects.create(
        name=name or f'Farm-{owner.email}',
        location='Kigali',
        owner=owner,
    )


def make_batch(farm):
    return Batch.objects.create(
        farm=farm,
        stage='EGG',
        expected_harvest_date=timezone.now() + timezone.timedelta(days=30),
    )


def extract_list(res_data):
    """Handle both paginated {data: [...]} and flat list responses."""
    if isinstance(res_data, dict) and 'data' in res_data:
        return res_data['data']
    return res_data


# ---------------------------------------------------------------------------
# Farm list — cooperative scoping
# ---------------------------------------------------------------------------

class FarmListScopingTests(APITestCase):

    def setUp(self):
        self.coop_a = Cooperative.objects.create(name='Coop Scope A')
        self.coop_b = Cooperative.objects.create(name='Coop Scope B')

        # FARMER users
        self.farmer_a1 = make_user('farmer_a1@test.com', 'FARMER', cooperative=self.coop_a)
        self.farmer_a2 = make_user('farmer_a2@test.com', 'FARMER', cooperative=self.coop_a)
        self.farmer_b  = make_user('farmer_b@test.com',  'FARMER', cooperative=self.coop_b)

        # SUPERVISOR for coop A
        self.supervisor_a = make_user('supervisor_scope_a@test.com', 'SUPERVISOR', cooperative=self.coop_a)

        # ADMIN (no cooperative)
        self.admin = make_user('admin_scope@test.com', 'ADMIN')

        # Farms
        self.farm_a1 = make_farm(self.farmer_a1, 'Farm A1')
        self.farm_a2 = make_farm(self.farmer_a2, 'Farm A2')
        self.farm_b  = make_farm(self.farmer_b,  'Farm B')

    # -- FARMER sees only own farms --

    def test_farmer_sees_only_own_farms(self):
        self.client.force_authenticate(user=self.farmer_a1)
        res = self.client.get(FARMS_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        farms_data = extract_list(res.json()['data'])
        ids = [f['id'] for f in farms_data]
        self.assertIn(self.farm_a1.id, ids)
        self.assertNotIn(self.farm_a2.id, ids)
        self.assertNotIn(self.farm_b.id, ids)

    def test_another_farmer_in_same_coop_cannot_see_other_farms(self):
        """Two farmers in the same cooperative should NOT see each other's farms."""
        self.client.force_authenticate(user=self.farmer_a2)
        res = self.client.get(FARMS_URL)
        farms_data = extract_list(res.json()['data'])
        ids = [f['id'] for f in farms_data]
        self.assertIn(self.farm_a2.id, ids)
        self.assertNotIn(self.farm_a1.id, ids)

    # -- SUPERVISOR cooperative scoping --

    def test_supervisor_sees_own_coop_farms_only(self):
        self.client.force_authenticate(user=self.supervisor_a)
        res = self.client.get(FARMS_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        farms_data = extract_list(res.json()['data'])
        ids = [f['id'] for f in farms_data]
        self.assertIn(self.farm_a1.id, ids)
        self.assertIn(self.farm_a2.id, ids)
        self.assertNotIn(self.farm_b.id, ids)

    def test_supervisor_without_cooperative_sees_nothing(self):
        sup_no_coop = make_user('sup_no_coop_scope@test.com', 'SUPERVISOR', cooperative=None)
        self.client.force_authenticate(user=sup_no_coop)
        res = self.client.get(FARMS_URL)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        farms_data = extract_list(res.json()['data'])
        self.assertEqual(len(farms_data), 0)

    # -- ADMIN sees everything --

    def test_admin_sees_all_farms(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(FARMS_URL)
        farms_data = extract_list(res.json()['data'])
        ids = [f['id'] for f in farms_data]
        self.assertIn(self.farm_a1.id, ids)
        self.assertIn(self.farm_a2.id, ids)
        self.assertIn(self.farm_b.id, ids)

    # -- Unauthenticated --

    def test_unauthenticated_rejected(self):
        res = self.client.get(FARMS_URL)
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


# ---------------------------------------------------------------------------
# Farm create — permission checks
# ---------------------------------------------------------------------------

class FarmCreatePermissionTests(APITestCase):

    def setUp(self):
        self.farmer = make_user('farmer_create@test.com', 'FARMER')
        self.supervisor = make_user('sup_create@test.com', 'SUPERVISOR')

    def test_farmer_can_create_farm(self):
        self.client.force_authenticate(user=self.farmer)
        res = self.client.post(FARMS_URL, {'name': 'My New Farm', 'location': 'Musanze'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # The created farm is owned by the requesting farmer
        farm_id = res.json()['data']['id']
        farm = Farm.objects.get(pk=farm_id)
        self.assertEqual(farm.owner, self.farmer)

    def test_supervisor_cannot_create_farm(self):
        self.client.force_authenticate(user=self.supervisor)
        res = self.client.post(FARMS_URL, {'name': 'Sup Farm', 'location': 'Rwamagana'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_farm_requires_name(self):
        self.client.force_authenticate(user=self.farmer)
        res = self.client.post(FARMS_URL, {'location': 'Nowhere'}, format='json')
        self.assertIn(res.status_code, [status.HTTP_422_UNPROCESSABLE_ENTITY, status.HTTP_400_BAD_REQUEST])

    def test_unauthenticated_cannot_create_farm(self):
        res = self.client.post(FARMS_URL, {'name': 'Ghost Farm', 'location': 'Nowhere'}, format='json')
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


# ---------------------------------------------------------------------------
# Farm detail — ownership checks
# ---------------------------------------------------------------------------

class FarmDetailScopingTests(APITestCase):

    def setUp(self):
        self.coop = Cooperative.objects.create(name='Coop Detail')
        self.farmer_owner = make_user('farm_owner@test.com', 'FARMER', cooperative=self.coop)
        self.farmer_other = make_user('farm_other@test.com', 'FARMER', cooperative=self.coop)
        self.supervisor = make_user('sup_detail@test.com', 'SUPERVISOR', cooperative=self.coop)
        self.admin = make_user('admin_detail@test.com', 'ADMIN')
        self.farm = make_farm(self.farmer_owner)

    def test_owner_can_view_farm(self):
        self.client.force_authenticate(user=self.farmer_owner)
        res = self.client.get(f'{FARMS_URL}/{self.farm.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_other_farmer_cannot_view_another_farm(self):
        """A different farmer in the same cooperative still cannot see another's farm."""
        self.client.force_authenticate(user=self.farmer_other)
        res = self.client.get(f'{FARMS_URL}/{self.farm.id}')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_supervisor_can_view_coop_farm(self):
        """SUPERVISOR in the same cooperative can view the farm."""
        self.client.force_authenticate(user=self.supervisor)
        res = self.client.get(f'{FARMS_URL}/{self.farm.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_admin_can_view_any_farm(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'{FARMS_URL}/{self.farm.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Batch list — scoped via farm ownership
# ---------------------------------------------------------------------------

class BatchListScopingTests(APITestCase):

    def setUp(self):
        self.coop = Cooperative.objects.create(name='Coop Batch')
        self.farmer = make_user('farmer_batch_scope@test.com', 'FARMER', cooperative=self.coop)
        self.other_farmer = make_user('other_batch@test.com', 'FARMER')
        self.supervisor = make_user('sup_batch@test.com', 'SUPERVISOR', cooperative=self.coop)

        self.farm = make_farm(self.farmer)
        self.other_farm = make_farm(self.other_farmer)
        self.batch_own = make_batch(self.farm)
        self.batch_other = make_batch(self.other_farm)

    def test_farmer_can_list_batches_for_own_farm(self):
        self.client.force_authenticate(user=self.farmer)
        res = self.client.get(f'{BATCHES_URL}/farm/{self.farm.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = extract_list(res.json()['data'])
        ids = [b['id'] for b in data]
        self.assertIn(self.batch_own.id, ids)

    def test_farmer_cannot_access_other_farm_batches(self):
        """Farmer requests batches for a farm they don't own — should get 404 or empty."""
        self.client.force_authenticate(user=self.farmer)
        res = self.client.get(f'{BATCHES_URL}/farm/{self.other_farm.id}')
        if res.status_code == status.HTTP_200_OK:
            data = extract_list(res.json()['data'])
            self.assertEqual(len(data), 0)
        else:
            self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_supervisor_can_list_batches_for_coop_farm(self):
        """SUPERVISOR can view batches in their cooperative's farms."""
        self.client.force_authenticate(user=self.supervisor)
        res = self.client.get(f'{BATCHES_URL}/farm/{self.farm.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = extract_list(res.json()['data'])
        ids = [b['id'] for b in data]
        self.assertIn(self.batch_own.id, ids)
