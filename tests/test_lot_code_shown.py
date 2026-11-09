"""The lot code is shown where staff already look: on a batch and on a disease check, so a disease leads to its lot."""
import pytest

from tests.factories import BatchFactory, DiseaseDetectionFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def farmer():
    return UserFactory(role='FARMER')


def test_a_batch_from_a_round_carries_its_lot_code_and_one_started_by_hand_carries_none(auth_client, farmer):
    farm = FarmFactory(owner=farmer)
    from_round = BatchFactory(farm=farm, lot_code='L2611-AB12')
    by_hand = BatchFactory(farm=farm)
    client = auth_client(farmer)

    assert client.get(f'/api/batches/{from_round.pk}').json()['data']['lotCode'] == 'L2611-AB12'
    assert client.get(f'/api/batches/{by_hand.pk}').json()['data']['lotCode'] == ''

    listed = {b['id']: b['lotCode'] for b in client.get(f'/api/batches/farm/{farm.pk}').json()['data']}
    assert listed == {from_round.pk: 'L2611-AB12', by_hand.pk: ''}


def test_a_disease_check_row_carries_the_lot_code_of_its_batch(auth_client, farmer):
    farm = FarmFactory(owner=farmer)
    DiseaseDetectionFactory(batch=BatchFactory(farm=farm, lot_code='L2611-AB12'), result='Grasserie')
    DiseaseDetectionFactory(batch=BatchFactory(farm=farm), result='Healthy')

    rows = auth_client(farmer).get('/api/detections/history').json()['data']
    rows = rows['items'] if isinstance(rows, dict) else rows

    assert sorted(r['lotCode'] for r in rows) == ['', 'L2611-AB12']
