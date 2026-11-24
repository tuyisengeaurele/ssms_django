"""A farmer or supervisor asks to move to another cooperative, or to leave one, and the SSMS team decides.

The person gives a reason. One request can be open at a time, held by the database. Approving moves the person the way the
admin route does (so the membership history is kept), cancels a farmer's open egg requests in the old cooperative and gives
the new cooperative's starting allowance. Declining needs a note, and both answers are mailed.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from audit_log.models import AuditLog
from cooperatives.models import CooperativeChangeRequest, CooperativeMembership
from core.doc_text import t
from farms.models import RearingRoom
from supply import allowance
from supply.models import Allowance, EggRequest, SupplyRound, SupplySettings
from tests.factories import CooperativeFactory, FarmFactory, UserFactory
from tests.support_helpers import acting, admin_and_person

pytestmark = pytest.mark.django_db

OPTIONS = '/api/cooperatives/options'
MINE = '/api/account/cooperative-request'
ADMIN = '/api/admin/cooperative-requests'
REASON = 'My farm is closer to the other cooperative store.'


@pytest.fixture
def sent(monkeypatch):
    """Every email the code tried to send, as (subject, recipients, text)."""
    mails = []
    monkeypatch.setattr(
        'cooperatives.change_requests.send_email_async', lambda subject, to, email, **kw: mails.append((subject, to, email.plain())),
    )
    return mails


@pytest.fixture
def world():
    old, new = CooperativeFactory(name='Old Coop'), CooperativeFactory(name='New Coop')
    return {
        'old': old,
        'new': new,
        'admin': UserFactory(role='ADMIN', name='Team Member'),
        'farmer': UserFactory(cooperative=old, name='Aline Uwase', phone='+250788000001'),
        'supervisor': UserFactory(role='SUPERVISOR', cooperative=old, name='Claire Uwimana', phone='+250722000111'),
    }


def ask(client, to=None, reason=REASON):
    return client.post(MINE, {'toCooperativeId': to.pk if hasattr(to, 'pk') else to, 'reason': reason}, format='json')


def decide(client, request_id, **body):
    return client.post(f'{ADMIN}/{request_id}/decision', body, format='json')


def code(response):
    return response.json().get('code')


# ── the list of names ────────────────────────────────────────────────────────────────────────

def test_options_list_active_cooperative_names_only_for_farmers_and_supervisors(auth_client, world):
    CooperativeFactory(name='Closed Coop', is_active=False)
    for who in ('farmer', 'supervisor'):
        response = auth_client(world[who]).get(OPTIONS)
        assert response.status_code == 200
        rows = response.json()['data']
        assert {r['name'] for r in rows} == {'Old Coop', 'New Coop'}
        assert all(set(r) == {'id', 'name'} for r in rows)
    assert auth_client(world['admin']).get(OPTIONS).status_code == 403


# ── asking ───────────────────────────────────────────────────────────────────────────────────

def test_a_farmer_can_ask_to_join_another_cooperative_or_to_leave_with_a_reason(auth_client, world):
    client = auth_client(world['farmer'])
    response = ask(client, world['new'])
    assert response.status_code == 201
    row = CooperativeChangeRequest.objects.get()
    assert (row.user_id, row.from_cooperative_id, row.to_cooperative_id, row.reason, row.status) == (
        world['farmer'].pk, world['old'].pk, world['new'].pk, REASON, 'requested',
    )
    assert client.delete(MINE).status_code == 200
    assert ask(client, None).status_code == 201
    leave = CooperativeChangeRequest.objects.get(status='requested')
    assert (leave.from_cooperative_id, leave.to_cooperative_id) == (world['old'].pk, None)


def test_a_person_with_no_cooperative_can_ask_to_join_one(auth_client):
    person = UserFactory(cooperative=None)
    coop = CooperativeFactory()
    assert ask(auth_client(person), coop).status_code == 201
    assert CooperativeChangeRequest.objects.get().from_cooperative_id is None


@pytest.mark.parametrize('reason', ['', '   ', None])
def test_an_empty_reason_is_refused(auth_client, world, reason):
    response = ask(auth_client(world['farmer']), world['new'], reason=reason)
    assert (response.status_code, code(response)) == (422, 'coop_reason_required')
    assert CooperativeChangeRequest.objects.count() == 0


def test_a_reason_over_500_characters_is_refused_and_500_is_accepted(auth_client, world):
    client = auth_client(world['farmer'])
    response = ask(client, world['new'], reason='x' * 501)
    assert (response.status_code, code(response)) == (422, 'coop_reason_required')
    assert ask(client, world['new'], reason='x' * 500).status_code == 201


def test_only_one_request_can_be_open_and_the_database_holds_it(auth_client, world):
    client = auth_client(world['farmer'])
    assert ask(client, world['new']).status_code == 201
    second = ask(client, None)
    assert (second.status_code, code(second)) == (409, 'coop_request_open')
    with pytest.raises(IntegrityError), transaction.atomic():
        CooperativeChangeRequest.objects.create(
            user=world['farmer'], from_cooperative=world['old'], to_cooperative=None, reason='again',
        )


def test_asking_for_the_cooperative_you_are_in_is_refused(auth_client, world):
    response = ask(auth_client(world['farmer']), world['old'])
    assert (response.status_code, code(response)) == (422, 'coop_request_same')


def test_leaving_when_you_have_no_cooperative_is_refused(auth_client):
    response = ask(auth_client(UserFactory(cooperative=None)), None)
    assert (response.status_code, code(response)) == (422, 'coop_request_same')


def test_the_database_refuses_a_move_to_the_same_cooperative(world):
    with pytest.raises(IntegrityError), transaction.atomic():
        CooperativeChangeRequest.objects.create(
            user=world['farmer'], from_cooperative=world['old'], to_cooperative=world['old'], reason='x',
        )


def test_an_unknown_or_deactivated_cooperative_is_not_found(auth_client, world):
    closed = CooperativeFactory(is_active=False)
    client = auth_client(world['farmer'])
    for target in ('does-not-exist', closed.pk):
        response = ask(client, target)
        assert (response.status_code, code(response)) == (404, 'not_found')


def test_an_admin_cannot_ask_and_support_access_cannot_use_the_routes(auth_client, world):
    admin_client = auth_client(world['admin'])
    assert ask(admin_client, world['new']).status_code == 403
    assert admin_client.get(MINE).status_code == 403
    admin, person = admin_and_person()
    token, _ = acting(admin, person)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    for response in (client.get(OPTIONS), client.get(MINE), ask(client, world['new']), client.delete(MINE)):
        assert response.status_code == 403
        assert code(response) == 'support_blocked'


# ── reading and withdrawing ──────────────────────────────────────────────────────────────────

def test_the_person_reads_their_open_request_or_the_last_decided_one_with_its_note_and_nobody_else_can(auth_client, world):
    farmer = auth_client(world['farmer'])
    assert farmer.get(MINE).json()['data'] is None
    ask(farmer, world['new'])
    open_one = farmer.get(MINE).json()['data']
    assert (open_one['status'], open_one['reason'], open_one['to']['name'], open_one['from']['name']) == ('requested', REASON, 'New Coop', 'Old Coop')
    request_id = open_one['id']
    decide(auth_client(world['admin']), request_id, decision='decline', note='Please talk to your supervisor first.')
    answered = farmer.get(MINE).json()['data']
    assert (answered['status'], answered['decisionNote']) == ('declined', 'Please talk to your supervisor first.')
    # Somebody else sees their own, which is nothing, and never this one.
    assert auth_client(world['supervisor']).get(MINE).json()['data'] is None


def test_the_open_request_wins_over_an_older_decided_one(auth_client, world):
    farmer = auth_client(world['farmer'])
    ask(farmer, world['new'])
    first = CooperativeChangeRequest.objects.get()
    decide(auth_client(world['admin']), first.pk, decision='decline', note='No.')
    ask(farmer, None)
    assert farmer.get(MINE).json()['data']['status'] == 'requested'


def test_withdraw_marks_it_withdrawn_and_frees_the_slot(auth_client, world):
    farmer = auth_client(world['farmer'])
    ask(farmer, world['new'])
    assert farmer.delete(MINE).status_code == 200
    row = CooperativeChangeRequest.objects.get()
    assert row.status == 'withdrawn' and row.decided_at is not None
    assert ask(farmer, world['new']).status_code == 201
    nothing = auth_client(world['supervisor']).delete(MINE)
    assert (nothing.status_code, code(nothing)) == (404, 'coop_nothing_to_withdraw')


# ── the admin list ───────────────────────────────────────────────────────────────────────────

def test_the_admin_list_shows_person_from_to_reason_number_and_flags_a_supervisor_whose_leaving_empties_a_cooperative(auth_client, world):
    ask(auth_client(world['farmer']), world['new'])
    ask(auth_client(world['supervisor']), world['new'])
    rows = {r['person']['name']: r for r in auth_client(world['admin']).get(ADMIN).json()['data']['requests']}
    farmer, supervisor = rows['Aline Uwase'], rows['Claire Uwimana']
    assert (farmer['from']['name'], farmer['to']['name'], farmer['reason']) == ('Old Coop', 'New Coop', REASON)
    assert farmer['person']['phone'] == '+250788000001' and farmer['person']['role'] == 'FARMER'
    assert farmer['onlySupervisor'] is False
    assert supervisor['onlySupervisor'] is True


def test_a_supervisor_with_a_colleague_is_not_flagged(auth_client, world):
    UserFactory(role='SUPERVISOR', cooperative=world['old'])
    ask(auth_client(world['supervisor']), world['new'])
    row = auth_client(world['admin']).get(ADMIN).json()['data']['requests'][0]
    assert row['onlySupervisor'] is False


def test_the_admin_list_filters_by_status_and_defaults_to_the_open_ones(auth_client, world):
    ask(auth_client(world['farmer']), world['new'])
    admin = auth_client(world['admin'])
    first = CooperativeChangeRequest.objects.get()
    decide(admin, first.pk, decision='decline', note='No.')
    ask(auth_client(world['supervisor']), None)
    assert [r['person']['name'] for r in admin.get(ADMIN).json()['data']['requests']] == ['Claire Uwimana']
    declined = admin.get(f'{ADMIN}?status=declined').json()['data']['requests']
    assert [r['person']['name'] for r in declined] == ['Aline Uwase']


def test_a_farmer_and_a_supervisor_cannot_read_the_admin_routes(auth_client, world):
    ask(auth_client(world['farmer']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    for who in ('farmer', 'supervisor'):
        client = auth_client(world[who])
        assert client.get(ADMIN).status_code == 403
        assert decide(client, row.pk, decision='approve').status_code == 403
    assert CooperativeChangeRequest.objects.get().status == 'requested'


# ── approving ────────────────────────────────────────────────────────────────────────────────

def test_approving_moves_the_person_keeps_the_membership_history_and_emails_them(auth_client, world, sent):
    ask(auth_client(world['farmer']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    sent.clear()
    response = decide(auth_client(world['admin']), row.pk, decision='approve', note='Welcome.')
    assert response.status_code == 200
    world['farmer'].refresh_from_db()
    row.refresh_from_db()
    assert world['farmer'].cooperative_id == world['new'].pk
    assert (row.status, row.decided_by_id, row.decision_note) == ('approved', world['admin'].pk, 'Welcome.')
    memberships = {m.cooperative_id: m for m in CooperativeMembership.objects.filter(user=world['farmer'])}
    assert memberships[world['old'].pk].ended_at is not None
    assert memberships[world['new'].pk].ended_at is None
    assert len(sent) == 1 and sent[0][1] == [world['farmer'].email] and 'cooperative change request' in sent[0][0].lower()
    assert 'New Coop' in sent[0][2] and 'Welcome.' in sent[0][2]


def test_approving_for_a_supervisor_moves_them_without_an_allowance(auth_client, world):
    ask(auth_client(world['supervisor']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    assert decide(auth_client(world['admin']), row.pk, decision='approve').status_code == 200
    world['supervisor'].refresh_from_db()
    assert world['supervisor'].cooperative_id == world['new'].pk
    assert Allowance.objects.filter(farmer=world['supervisor']).count() == 0


def farmer_with_requests(world):
    """A farmer of the old cooperative with one waiting and one received egg request."""
    farmer, supervisor = world['farmer'], world['supervisor']
    SupplySettings.objects.all().delete()
    settings = SupplySettings.for_cooperative(world['old'])
    settings.m2_per_box = Decimal('4')
    settings.save()
    allowance.set_start(farmer, world['old'], 3, by=None)
    room = RearingRoom.objects.create(farm=FarmFactory(owner=farmer), name='Room A', area_m2=Decimal('20'))
    when = timezone.now()
    made = []
    for name, status in (('One', EggRequest.Status.SUBMITTED), ('Two', EggRequest.Status.RECEIVED)):
        rnd = SupplyRound.objects.create(
            cooperative=world['old'], name=name, status='open', stock_boxes=10, request_deadline=when + timedelta(days=3),
            delivery_date=(when + timedelta(days=7)).date(), delivery_place='Store',
            expected_harvest_date=(when + timedelta(days=40)).date(), created_by=supervisor,
        )
        made.append(EggRequest.objects.create(round=rnd, farmer=farmer, farm=room.farm, room=room, boxes_asked=1, status=status))
    return made


def test_approving_cancels_a_farmers_open_egg_requests_in_the_old_cooperative_and_gives_the_new_starting_allowance(auth_client, world):
    waiting, received = farmer_with_requests(world)
    SupplySettings.for_cooperative(world['new'])
    new_default = SupplySettings.for_cooperative(world['new']).starter_boxes
    ask(auth_client(world['farmer']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    assert decide(auth_client(world['admin']), row.pk, decision='approve').status_code == 200
    waiting.refresh_from_db()
    received.refresh_from_db()
    assert waiting.status == 'cancelled' and 'cooperative' in waiting.decision_note.lower()
    assert received.status == 'received'
    world['farmer'].refresh_from_db()
    mine = Allowance.objects.get(farmer=world['farmer'])
    assert (mine.cooperative_id, mine.boxes) == (world['new'].pk, new_default)


def test_approving_withdraws_a_farmers_open_allowance_request_in_the_old_cooperative(auth_client, world):
    farmer_with_requests(world)
    open_request = allowance.ask(world['farmer'], 4, 'I built a second house')
    ask(auth_client(world['farmer']), world['new'])
    decide(auth_client(world['admin']), CooperativeChangeRequest.objects.get().pk, decision='approve')
    open_request.refresh_from_db()
    assert open_request.status == 'withdrawn'


def test_approving_a_leave_request_empties_the_cooperative_and_gives_no_allowance(auth_client, world):
    ask(auth_client(world['farmer']), None)
    row = CooperativeChangeRequest.objects.get()
    assert decide(auth_client(world['admin']), row.pk, decision='approve').status_code == 200
    world['farmer'].refresh_from_db()
    assert world['farmer'].cooperative_id is None
    assert not CooperativeMembership.objects.filter(user=world['farmer'], ended_at__isnull=True).exists()
    assert Allowance.objects.filter(farmer=world['farmer'], cooperative=world['new']).count() == 0


# ── declining and the other refusals ─────────────────────────────────────────────────────────

def test_declining_needs_a_note_and_emails_it(auth_client, world, sent):
    ask(auth_client(world['farmer']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    admin = auth_client(world['admin'])
    refused = decide(admin, row.pk, decision='decline', note='   ')
    assert (refused.status_code, code(refused)) == (422, 'coop_note_required')
    sent.clear()
    assert decide(admin, row.pk, decision='decline', note='Please talk to your supervisor first.').status_code == 200
    world['farmer'].refresh_from_db()
    row.refresh_from_db()
    assert world['farmer'].cooperative_id == world['old'].pk and row.status == 'declined'
    assert len(sent) == 1 and sent[0][1] == [world['farmer'].email] and 'Please talk to your supervisor first.' in sent[0][2]


def test_a_decision_must_be_approve_or_decline(auth_client, world):
    ask(auth_client(world['farmer']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    response = decide(auth_client(world['admin']), row.pk, decision='maybe')
    assert (response.status_code, code(response)) == (400, 'coop_bad_decision')


def test_deciding_twice_is_refused_with_409_already_decided(auth_client, world):
    ask(auth_client(world['farmer']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    admin = auth_client(world['admin'])
    assert decide(admin, row.pk, decision='approve').status_code == 200
    again = decide(admin, row.pk, decision='decline', note='Too late.')
    assert (again.status_code, code(again)) == (409, 'coop_already_decided')
    assert CooperativeChangeRequest.objects.get().status == 'approved'


def test_deciding_on_a_request_that_does_not_exist_is_not_found(auth_client, world):
    response = decide(auth_client(world['admin']), 'nope', decision='approve')
    assert response.status_code == 404


def test_approving_for_a_deactivated_person_a_deactivated_cooperative_or_a_person_who_already_moved_is_refused_cleanly(auth_client, world):
    admin = auth_client(world['admin'])
    other = CooperativeFactory(name='Third Coop')

    ask(auth_client(world['farmer']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    type(world['farmer']).objects.filter(pk=world['farmer'].pk).update(is_active=False)
    inactive = decide(admin, row.pk, decision='approve')
    assert (inactive.status_code, code(inactive)) == (409, 'coop_person_inactive')
    type(world['farmer']).objects.filter(pk=world['farmer'].pk).update(is_active=True)

    type(world['new']).objects.filter(pk=world['new'].pk).update(is_active=False)
    closed = decide(admin, row.pk, decision='approve')
    assert (closed.status_code, code(closed)) == (409, 'coop_cooperative_inactive')
    type(world['new']).objects.filter(pk=world['new'].pk).update(is_active=True)

    world['farmer'].cooperative = other
    world['farmer'].save(update_fields=['cooperative'])
    moved = decide(admin, row.pk, decision='approve')
    assert (moved.status_code, code(moved)) == (409, 'coop_already_moved')

    row.refresh_from_db()
    assert row.status == 'requested', 'a refused approval leaves the request open, so it can still be declined'
    assert decide(admin, row.pk, decision='decline', note='You moved already.').status_code == 200


def test_a_refused_approval_changes_nothing_half_way(auth_client, world):
    waiting, _ = farmer_with_requests(world)
    ask(auth_client(world['farmer']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    type(world['new']).objects.filter(pk=world['new'].pk).update(is_active=False)
    assert decide(auth_client(world['admin']), row.pk, decision='approve').status_code == 409
    waiting.refresh_from_db()
    assert waiting.status == 'submitted'
    world['farmer'].refresh_from_db()
    assert world['farmer'].cooperative_id == world['old'].pk


# ── the record and the words ─────────────────────────────────────────────────────────────────

def test_a_decision_is_written_to_the_audit_log(auth_client, world):
    ask(auth_client(world['farmer']), world['new'])
    row = CooperativeChangeRequest.objects.get()
    decide(auth_client(world['admin']), row.pk, decision='approve')
    entry = AuditLog.objects.filter(resource='CooperativeChangeRequest').order_by('-created_at').first()
    assert entry is not None and 'Aline Uwase' in entry.detail and 'New Coop' in entry.detail
    assert AuditLog.objects.filter(resource='CooperativeChangeRequest').count() == 2, 'the asking is written too'


def test_the_team_is_told_when_a_request_waits(auth_client, world, sent):
    ask(auth_client(world['farmer']), world['new'])
    assert [m[1] for m in sent] == [[world['admin'].email]]
    assert 'Aline Uwase' in sent[0][2] and REASON in sent[0][2]


def test_a_mail_that_cannot_be_sent_never_fails_the_request(auth_client, world, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError('smtp down')
    monkeypatch.setattr('cooperatives.change_requests.send_email_async', broken)
    assert ask(auth_client(world['farmer']), world['new']).status_code == 201
    row = CooperativeChangeRequest.objects.get()
    assert decide(auth_client(world['admin']), row.pk, decision='approve').status_code == 200


def test_the_new_texts_exist_in_three_languages():
    for key in ('erCoopRequestOpen', 'erCoopRequestSame', 'erCoopReasonRequired', 'erCoopNoteRequired', 'erCoopAlreadyDecided',
                'erCoopPersonInactive', 'erCoopCooperativeInactive', 'erCoopAlreadyMoved', 'erCoopNothingToWithdraw'):
        texts = {lang: t(lang, key) for lang in ('en', 'fr', 'rw')}
        assert all(texts.values()), key
        assert len(set(texts.values())) == 3, key
