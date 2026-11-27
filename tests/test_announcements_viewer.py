"""Who sees which of the SSMS team's announcements, and when."""
from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from announcements.models import Announcement
from tests.factories import UserFactory
from tests.mfa_helpers import client_with, enable_factor, session_for
from tests.support_helpers import acting, admin_and_person

pytestmark = pytest.mark.django_db

CURRENT = '/api/announcements'
PUBLIC = '/api/announcements/public'


def announce(words='SSMS is off on Saturday night.', *, kind='information', starts=-1, ends=24, **fields):
    """One announcement. `starts` and `ends` are hours from now."""
    now = timezone.now()
    return Announcement.objects.create(
        kind=kind, text_en=words, show_from=now + timedelta(hours=starts), show_until=now + timedelta(hours=ends), **fields,
    )


def signed_in(user, **session):
    return client_with(user, session_for(user, **session))


def words(response):
    return [row['text']['en'] for row in response.data['data']]


# ── when ────────────────────────────────────────────────────────────────────────────────────

def test_only_what_is_showing_now():
    announce('showing')
    announce('not yet', starts=1, ends=2)
    announce('run out', starts=-3, ends=-1)
    announce('ended by hand', ended_at=timezone.now())
    assert words(signed_in(UserFactory()).get(CURRENT)) == ['showing']


def test_the_first_moment_is_in_and_the_last_is_not():
    now = timezone.now()
    Announcement.objects.create(kind='information', text_en='starts now', show_from=now, show_until=now + timedelta(hours=1))
    Announcement.objects.create(kind='information', text_en='ends now', show_from=now - timedelta(hours=1), show_until=now)
    assert [a.text_en for a in Announcement.objects.showing(now)] == ['starts now']


# ── in what order, and how many ─────────────────────────────────────────────────────────────

def test_urgent_first_then_maintenance_then_information_newest_first():
    announce('older information', kind='information', starts=-5)
    announce('maintenance', kind='maintenance', starts=-9)
    announce('newer information', kind='information', starts=-1)
    announce('urgent', kind='urgent', starts=-20)
    got = words(signed_in(UserFactory()).get(CURRENT))
    assert got == ['urgent', 'maintenance', 'newer information', 'older information']


def test_no_more_than_ten_are_sent():
    for n in range(12):
        announce(f'notice {n}', show_public=True)
    assert len(words(signed_in(UserFactory()).get(CURRENT))) == 10
    assert len(words(APIClient().get(PUBLIC))) == 10


# ── who ─────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', ['FARMER', 'SUPERVISOR', 'ADMIN'])
def test_everybody_signed_in_sees_all_of_them(role):
    announce('for visitors too', show_public=True)
    announce('signed in only')
    user = UserFactory(role=role)
    session = {'verified_minutes_ago': 0} if role == 'ADMIN' else {}
    if role == 'ADMIN':
        enable_factor(user)
    assert sorted(words(signed_in(user, **session).get(CURRENT))) == ['for visitors too', 'signed in only']


def test_a_stranger_is_told_to_sign_in_for_all_of_them():
    assert APIClient().get(CURRENT).status_code == 401


def test_a_visitor_sees_only_what_is_marked_for_visitors():
    announce('for visitors too', show_public=True)
    announce('signed in only')
    assert words(APIClient().get(PUBLIC)) == ['for visitors too']


@pytest.mark.parametrize('url', [CURRENT, PUBLIC])
def test_a_row_says_nothing_but_what_the_banner_needs(url):
    admin = UserFactory(role='ADMIN', name='Aline Admin')
    announce('hello', kind='maintenance', show_public=True, created_by=admin, text_fr='bonjour')
    client = signed_in(UserFactory()) if url == CURRENT else APIClient()
    row = client.get(url).json()['data'][0]
    assert sorted(row) == ['id', 'kind', 'showUntil', 'text', 'version']
    assert row['text'] == {'en': 'hello', 'fr': 'bonjour', 'rw': ''}
    assert (row['kind'], row['version']) == ('maintenance', 1)
    assert 'Aline' not in str(row)


# A visitor's browser may still hold a token from an old sign in. The public route must not mind, or it would answer 401.
@pytest.mark.parametrize('token', ['rubbish', 'expired', 'ended'])
def test_an_old_or_broken_token_makes_no_difference_to_the_public_route(token):
    announce('hello', show_public=True)
    user = UserFactory()
    if token == 'rubbish':
        header = 'Bearer not-a-token'
    elif token == 'expired':
        old = AccessToken.for_user(user)
        old.set_exp(lifetime=-timedelta(minutes=1))
        header = f'Bearer {old}'
    else:
        session = session_for(user)
        ended = AccessToken.for_user(user)
        ended['sid'] = session.id
        type(session).objects.filter(pk=session.pk).update(revoked_at=timezone.now())
        header = f'Bearer {ended}'
    response = APIClient().get(PUBLIC, HTTP_AUTHORIZATION=header)
    assert response.status_code == 200 and words(response) == ['hello']


def test_the_public_answer_may_be_kept_for_a_minute():
    assert APIClient().get(PUBLIC)['Cache-Control'] == 'public, max-age=60'


@pytest.mark.parametrize('fields', [{'phone': None}, {'deletion_requested_at': timezone.now()}], ids=['no phone', 'closing'])
def test_an_account_held_at_a_screen_of_its_own_still_sees_them(fields):
    announce('maintenance tonight')
    assert words(signed_in(UserFactory(**fields)).get(CURRENT)) == ['maintenance tonight']


def test_a_support_visit_sees_what_the_person_would():
    announce('hello')
    admin, person = admin_and_person('FARMER')
    token, _ = acting(admin, person)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    assert words(client.get(CURRENT)) == ['hello']


def test_asking_costs_the_same_for_one_or_eight(django_assert_num_queries):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    announce(show_public=True)
    client = APIClient()
    with CaptureQueriesContext(connection) as few:
        client.get(PUBLIC)
    for _ in range(7):
        announce(show_public=True)
    with django_assert_num_queries(len(few)):
        client.get(PUBLIC)


# ── what the database refuses ───────────────────────────────────────────────────────────────

def test_the_database_refuses_an_end_before_its_start():
    now = timezone.now()
    with pytest.raises(IntegrityError), transaction.atomic():
        Announcement.objects.create(kind='information', text_en='x', show_from=now, show_until=now)
