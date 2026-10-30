"""A harvest lot can carry a QR code. A buyer who scans it sees a short page about the lot, with no sign in.

The farmer decides: they make the link, and they can switch it off. What a stranger sees is kept small on purpose: the
farm, the district, the dates, the weight and the grade. Never the owner, their contact details, the street or notes.
"""
import json
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from audit_log.models import AuditLog
from batches.models import Batch
from harvest.models import HarvestRecord
from locations import registry
from tests.factories import BatchFactory, CooperativeFactory, FarmFactory, HarvestRecordFactory, UserFactory

pytestmark = pytest.mark.django_db

LEVELS = ['province', 'district', 'sector', 'cell', 'village']


def codes(district='Nyarugenge'):
    """The five codes of a real village in a district."""
    district_code = next(p['code'] for p in registry.walk() if p['level'] == 'district' and p['name'] == district)
    village = sorted((p for p in registry.walk() if p['level'] == 'village' and registry.chain(p['code'])['district']['code'] == district_code), key=lambda p: p['code'])[0]
    chain = registry.chain(village['code'])
    return {f'{level}_code': chain[level]['code'] for level in LEVELS}


@pytest.fixture
def owner():
    return UserFactory(role='FARMER', name='Aline Uwase Secretname', email='aline.secret@example.rw')


@pytest.fixture
def farm(owner):
    return FarmFactory(owner=owner, name='Hillside Farm', street='KG 11 Ave Secret Street', latitude=-1.9441, longitude=30.0619, **codes())


@pytest.fixture
def batch(farm):
    batch = BatchFactory(farm=farm, stage='HARVEST', breed='Bivoltine')
    Batch.objects.filter(pk=batch.pk).update(start_date=timezone.now() - timedelta(days=40))
    batch.refresh_from_db()
    return batch


@pytest.fixture
def lot(batch):
    record = HarvestRecordFactory(batch=batch, cocoon_weight_kg=Decimal('18.50'), silk_yield_g=Decimal('2100.00'), quality_grade='A', notes='Private note about the price')
    HarvestRecord.objects.filter(pk=record.pk).update(harvested_at=batch.start_date + timedelta(days=30))
    record.refresh_from_db()
    return record


def share_url(lot):
    return f'/api/harvest/{lot.pk}/share'


def public(client, token):
    return client.get(f'/api/lots/{token}')


def make_link(client, lot):
    response = client.post(share_url(lot))
    assert response.status_code in (200, 201), response.content[:200]
    return response.data['data']['token']


# ── making and ending the link ──────────────────────────────────────────────

class TestSharing:
    def test_the_owner_makes_a_link_for_a_lot(self, auth_client, owner, lot):
        response = auth_client(owner).post(share_url(lot))
        assert response.status_code == 201
        token = response.data['data']['token']
        assert len(token) >= 20
        assert response.data['data']['shared_at']

    def test_the_link_cannot_be_guessed_from_the_lot(self, auth_client, owner, lot):
        token = make_link(auth_client(owner), lot)
        assert lot.pk not in token
        assert token != lot.pk

    def test_asking_again_gives_the_same_link(self, auth_client, owner, lot):
        client = auth_client(owner)
        first = make_link(client, lot)
        again = client.post(share_url(lot))
        assert again.status_code == 200
        assert again.data['data']['token'] == first

    def test_the_owner_can_read_the_link_again_to_print_it(self, auth_client, owner, lot):
        client = auth_client(owner)
        assert client.get(share_url(lot)).data['data']['token'] is None
        token = make_link(client, lot)
        assert client.get(share_url(lot)).data['data']['token'] == token

    def test_stopping_the_sharing_kills_the_link(self, auth_client, owner, lot, api_client):
        client = auth_client(owner)
        token = make_link(client, lot)
        assert public(api_client, token).status_code == 200
        assert client.delete(share_url(lot)).status_code == 200
        assert public(api_client, token).status_code == 404
        assert client.get(share_url(lot)).data['data']['token'] is None

    def test_sharing_again_gives_a_new_link_and_the_old_one_stays_dead(self, auth_client, owner, lot, api_client):
        client = auth_client(owner)
        old = make_link(client, lot)
        client.delete(share_url(lot))
        new = make_link(client, lot)
        assert new != old
        assert public(api_client, old).status_code == 404
        assert public(api_client, new).status_code == 200

    def test_stopping_a_lot_that_was_never_shared_is_harmless(self, auth_client, owner, lot):
        assert auth_client(owner).delete(share_url(lot)).status_code == 200

    def test_making_and_ending_a_link_is_audited(self, auth_client, owner, lot):
        client = auth_client(owner)
        make_link(client, lot)
        client.delete(share_url(lot))
        entries = list(AuditLog.objects.filter(resource='HarvestRecord', resource_id=lot.pk).order_by('created_at').values_list('action', 'detail'))
        assert [a for a, _ in entries] == ['UPDATE', 'UPDATE']
        assert 'shared' in entries[0][1].lower() and 'stopped' in entries[1][1].lower()

    def test_the_audit_entry_does_not_hold_the_link(self, auth_client, owner, lot):
        token = make_link(auth_client(owner), lot)
        assert not any(token in (e.detail or '') for e in AuditLog.objects.all())

    def test_the_harvest_list_says_which_lots_are_shared_without_giving_the_link(self, auth_client, owner, lot):
        client = auth_client(owner)
        assert client.get('/api/harvest').data['data'][0]['is_shared'] is False
        token = make_link(client, lot)
        row = client.get('/api/harvest').data['data'][0]
        assert row['is_shared'] is True
        assert token not in json.dumps(client.get('/api/harvest').data)


class TestWhoMayShare:
    def test_another_farmer_cannot_touch_the_link(self, auth_client, lot):
        stranger = UserFactory(role='FARMER')
        client = auth_client(stranger)
        assert client.post(share_url(lot)).status_code == 404
        assert client.get(share_url(lot)).status_code == 404
        assert client.delete(share_url(lot)).status_code == 404

    def test_a_supervisor_cannot_make_or_end_a_link_nor_read_it(self, auth_client, owner, lot):
        coop = CooperativeFactory()
        type(owner).objects.filter(pk=owner.pk).update(cooperative=coop)
        supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
        client = auth_client(supervisor)
        assert client.post(share_url(lot)).status_code == 403
        assert client.get(share_url(lot)).status_code == 403
        assert client.delete(share_url(lot)).status_code == 403

    def test_an_administrator_may(self, auth_client, lot):
        admin = UserFactory(role='ADMIN')
        assert auth_client(admin).post(share_url(lot)).status_code == 201

    def test_a_sign_in_is_needed(self, api_client, lot):
        assert api_client.post(share_url(lot)).status_code == 401
        assert api_client.get(share_url(lot)).status_code == 401
        assert api_client.delete(share_url(lot)).status_code == 401

    def test_a_deleted_lot_cannot_be_shared(self, auth_client, owner, lot):
        HarvestRecord.objects.filter(pk=lot.pk).update(is_active=False)
        assert auth_client(owner).post(share_url(lot)).status_code == 404

    def test_a_lot_cannot_be_shared_through_a_deleted_batch_or_farm(self, auth_client, owner, lot, batch, farm):
        Batch.objects.filter(pk=batch.pk).update(is_active=False)
        assert auth_client(owner).post(share_url(lot)).status_code == 404

    def test_the_share_address_does_not_take_over_the_delete_address(self, auth_client, owner, lot):
        assert auth_client(owner).delete(f'/api/harvest/{lot.pk}').status_code == 200


class TestWhatAStrangerSees:
    @pytest.fixture
    def token(self, auth_client, owner, lot):
        return make_link(auth_client(owner), lot)

    def test_needs_no_sign_in(self, api_client, token):
        assert public(api_client, token).status_code == 200

    def test_shows_the_lot_the_farm_and_the_district(self, api_client, token):
        data = public(api_client, token).data['data']
        assert data['farm_name'] == 'Hillside Farm'
        assert data['district'] == 'Nyarugenge'
        assert data['province'] == 'Kigali City'
        assert data['breed'] == 'Bivoltine'
        assert data['grade'] == 'A'
        assert data['cocoon_weight_kg'] == 18.5
        assert data['silk_yield_g'] == 2100.0
        assert data['rearing_days'] == 30
        assert data['harvested_on'] == (timezone.now() - timedelta(days=10)).date().isoformat()
        assert data['started_on'] == (timezone.now() - timedelta(days=40)).date().isoformat()

    def test_names_the_cooperative_when_the_farm_is_in_one(self, api_client, auth_client, owner, lot):
        coop = CooperativeFactory(name='Gatsibo Silk Cooperative')
        type(owner).objects.filter(pk=owner.pk).update(cooperative=coop)
        token = make_link(auth_client(owner), lot)
        assert public(api_client, token).data['data']['cooperative_name'] == 'Gatsibo Silk Cooperative'

    def test_gives_no_cooperative_when_there_is_none(self, api_client, token):
        assert public(api_client, token).data['data']['cooperative_name'] is None

    def test_leaves_out_what_is_empty(self, api_client, auth_client, owner, farm):
        batch = BatchFactory(farm=farm, stage='HARVEST', breed='')
        record = HarvestRecordFactory(batch=batch, silk_yield_g=None)
        data = public(api_client, make_link(auth_client(owner), record)).data['data']
        assert data['breed'] is None
        assert data['silk_yield_g'] is None

    def test_a_farm_from_before_places_has_no_district(self, api_client, auth_client, owner):
        old = FarmFactory(owner=owner, name='Old Farm', location='Gatsibo')
        record = HarvestRecordFactory(batch=BatchFactory(farm=old, stage='HARVEST'))
        data = public(api_client, make_link(auth_client(owner), record)).data['data']
        assert data['district'] is None
        assert data['province'] is None

    def test_never_shows_the_owner_their_contact_details_the_street_the_position_or_the_notes(self, api_client, owner, token):
        body = public(api_client, token).content.decode()
        for secret in ['Aline', 'Secretname', 'aline.secret', 'example.rw', 'KG 11', 'Secret Street', 'Private note', '-1.9441', '30.0619']:
            assert secret not in body, secret

    def test_shows_only_these_fields(self, api_client, token):
        assert set(public(api_client, token).data['data']) == {
            'farm_name', 'province', 'district', 'cooperative_name', 'breed', 'grade', 'cocoon_weight_kg',
            'silk_yield_g', 'started_on', 'harvested_on', 'rearing_days',
        }

    def test_is_not_kept_by_browsers_or_search_engines(self, api_client, token):
        response = public(api_client, token)
        assert 'no-store' in response['Cache-Control']
        assert 'noindex' in response['X-Robots-Tag']

    def test_works_when_the_batch_dates_have_no_time_zone(self, api_client, token, naive_batch_dates):
        assert public(api_client, token).data['data']['rearing_days'] == 30


class TestABadLink:
    @pytest.fixture
    def token(self, auth_client, owner, lot):
        return make_link(auth_client(owner), lot)

    def test_an_unknown_link_is_a_plain_404(self, api_client):
        assert public(api_client, 'not-a-real-link').status_code == 404

    @pytest.mark.parametrize('stop', ['lot', 'batch', 'farm'])
    def test_a_link_stops_working_when_the_lot_batch_or_farm_is_deleted(self, api_client, token, lot, batch, farm, stop):
        if stop == 'lot':
            HarvestRecord.objects.filter(pk=lot.pk).update(is_active=False)
        elif stop == 'batch':
            Batch.objects.filter(pk=batch.pk).update(is_active=False)
        else:
            type(farm).objects.filter(pk=farm.pk).update(is_active=False)
        assert public(api_client, token).status_code == 404

    def test_every_bad_link_gets_the_same_answer(self, api_client, auth_client, owner, lot, token):
        auth_client(owner).delete(share_url(lot))
        revoked = public(api_client, token)
        unknown = public(api_client, 'x' * 22)
        assert revoked.status_code == unknown.status_code == 404
        assert revoked.data == unknown.data

    def test_an_empty_token_is_not_a_match_for_a_lot_that_was_never_shared(self, api_client, lot):
        assert lot.share_token is None
        assert api_client.get('/api/lots/').status_code in (404, 405)

    @pytest.mark.throttle
    def test_a_stranger_asking_too_often_is_slowed_down(self, api_client):
        codes_seen = {public(api_client, f'guess-{i}').status_code for i in range(40)}
        assert 429 in codes_seen
