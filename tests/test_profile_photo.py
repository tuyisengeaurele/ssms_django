"""A person adds a profile photo. It is checked by what is in the file, cropped square, made at most 512 px, stripped of location
data and saved as WebP in its own table. It is served at an address made of a random token that changes with every new photo, and
only the people who may see the person are sent that address (the same rule as the phone number).
"""
import io
import time

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from cooperatives.models import CooperativeMembership
from core.doc_text import t
from tests.factories import CooperativeFactory, UserFactory
from tests.support_helpers import acting, admin_and_person
from users import closure
from users.models import UserPhoto
from users.phone_visibility import person_row, visible_phone_ids
from users.photo import MAX_BYTES, SIDE, PhotoError, process_photo

pytestmark = pytest.mark.django_db

PHOTO = '/api/auth/me/photo'
ME = '/api/auth/me'


def picture(size=(300, 200), fmt='JPEG', color=(200, 30, 30), exif=None, mode='RGB') -> bytes:
    image = Image.new(mode, size, color)
    buffer = io.BytesIO()
    options = {'exif': exif} if exif is not None else {}
    image.save(buffer, fmt, **options)
    return buffer.getvalue()


def send(client, content, name='me.jpg', content_type='image/jpeg'):
    return client.patch(PHOTO, {'photo': SimpleUploadedFile(name, content, content_type)}, format='multipart')


def fetch(path):
    return APIClient().get(path)


def stored(response):
    return Image.open(io.BytesIO(response.content))


@pytest.fixture
def farmer():
    return UserFactory(name='Aline Uwase')


# ── what is accepted ─────────────────────────────────────────────────────────────────────────

def test_a_farmer_can_add_a_photo_and_it_is_served_as_a_square_webp_without_signing_in(jwt_client, farmer):
    response = send(jwt_client(farmer), picture((300, 200)))
    assert response.status_code == 200, response.content
    path = response.json()['data']['photoUrl']
    assert path.startswith('/api/photos/') and len(path) > len('/api/photos/') + 30
    served = fetch(path)
    assert served.status_code == 200
    assert served['Content-Type'] == 'image/webp'
    assert stored(served).format == 'WEBP' and stored(served).size == (200, 200)


def test_a_big_picture_is_made_at_most_512_pixels_square(jwt_client, farmer):
    response = send(jwt_client(farmer), picture((3000, 1500)))
    assert stored(fetch(response.json()['data']['photoUrl'])).size == (SIDE, SIDE)
    assert SIDE == 512


def test_the_file_is_served_with_a_long_private_cache_and_no_sniffing(jwt_client, farmer):
    served = fetch(send(jwt_client(farmer), picture()).json()['data']['photoUrl'])
    assert served['Cache-Control'] == 'private, max-age=86400'
    assert served['X-Content-Type-Options'] == 'nosniff'


@pytest.mark.parametrize('fmt,ctype,name', [('PNG', 'image/png', 'a.png'), ('WEBP', 'image/webp', 'a.webp'), ('JPEG', 'image/jpeg', 'a.jpg')])
def test_a_jpeg_a_png_and_a_webp_are_accepted(jwt_client, farmer, fmt, ctype, name):
    assert send(jwt_client(farmer), picture(fmt=fmt), name, ctype).status_code == 200


def test_a_picture_with_a_see_through_background_is_accepted(jwt_client, farmer):
    assert send(jwt_client(farmer), picture(fmt='PNG', mode='RGBA', color=(0, 0, 0, 0)), 'a.png', 'image/png').status_code == 200


# ── what is refused ──────────────────────────────────────────────────────────────────────────

def test_a_script_renamed_to_jpg_is_refused_by_what_is_in_it(jwt_client, farmer):
    response = send(jwt_client(farmer), b'<?php system($_GET["c"]); ?>', 'me.jpg', 'image/jpeg')
    assert response.status_code == 422
    assert response.json()['code'] == 'photo_not_image'
    assert response.json()['message'] == t('en', 'erPhotoNotImage')
    assert not UserPhoto.objects.exists()


def test_a_cut_off_picture_and_a_gif_are_refused(jwt_client, farmer):
    assert send(jwt_client(farmer), picture()[:200]).json()['code'] == 'photo_not_image'
    assert send(jwt_client(farmer), picture(fmt='GIF'), 'a.gif', 'image/gif').json()['code'] == 'photo_not_image'


def test_more_than_two_megabytes_is_refused_before_it_is_read_as_a_picture(jwt_client, farmer):
    response = send(jwt_client(farmer), b'\xff\xd8' + b'0' * MAX_BYTES)
    assert response.status_code == 422
    assert response.json()['code'] == 'photo_too_large'
    assert MAX_BYTES == 2 * 1024 * 1024


def test_a_small_file_that_claims_a_huge_picture_is_refused(jwt_client, farmer):
    huge = picture((9000, 9000), 'PNG', color=0, mode='1')
    assert len(huge) < MAX_BYTES
    response = send(jwt_client(farmer), huge, 'a.png', 'image/png')
    assert response.status_code == 422 and response.json()['code'] == 'photo_too_large'


def test_no_file_is_a_refusal_with_its_own_code(jwt_client, farmer):
    response = jwt_client(farmer).patch(PHOTO, {}, format='multipart')
    assert response.status_code == 422 and response.json()['code'] == 'photo_missing'


def test_process_photo_raises_a_photo_error_with_a_status_and_a_code():
    with pytest.raises(PhotoError) as caught:
        process_photo(SimpleUploadedFile('x.jpg', b'nope', 'image/jpeg'))
    assert (caught.value.status, caught.value.code) == (422, 'photo_not_image')


# ── what is kept and what is not ─────────────────────────────────────────────────────────────

def test_location_and_camera_data_are_gone_from_the_stored_file(jwt_client, farmer):
    exif = Image.Exif()
    exif[0x010F] = 'SecretCameraMaker'
    exif[0x0132] = '2026:11:24 10:00:00'
    exif[0x8825] = {1: 'S', 2: (1.0, 57.0, 0.0), 3: 'E', 4: (30.0, 4.0, 0.0)}
    body = picture((200, 200), exif=exif)
    assert b'SecretCameraMaker' in body
    served = fetch(send(jwt_client(farmer), body).json()['data']['photoUrl'])
    assert b'SecretCameraMaker' not in served.content
    assert len(stored(served).getexif()) == 0
    assert stored(served).info.get('exif') in (None, b'')


def test_a_photo_taken_sideways_is_turned_upright(jwt_client, farmer):
    image = Image.new('RGB', (100, 100), (0, 0, 255))
    image.paste((255, 0, 0), (0, 0, 100, 50))   # red on top, as the camera saw it
    exif = Image.Exif()
    exif[0x0112] = 3   # the camera says: turn it half a turn
    buffer = io.BytesIO()
    image.save(buffer, 'JPEG', exif=exif)
    served = stored(fetch(send(jwt_client(farmer), buffer.getvalue()).json()['data']['photoUrl'])).convert('RGB')
    top, bottom = served.getpixel((50, 5)), served.getpixel((50, 95))
    assert bottom[0] > 200 > top[0] and top[2] > 200   # blue now on top, red at the bottom


def test_a_small_picture_is_not_made_bigger(jwt_client, farmer):
    assert stored(fetch(send(jwt_client(farmer), picture((100, 80))).json()['data']['photoUrl'])).size == (80, 80)


# ── replacing and removing ───────────────────────────────────────────────────────────────────

def test_a_new_photo_gets_a_new_address_and_the_old_one_stops_working(jwt_client, farmer):
    client = jwt_client(farmer)
    old = send(client, picture(color=(255, 0, 0))).json()['data']['photoUrl']
    new = send(client, picture(color=(0, 255, 0))).json()['data']['photoUrl']
    assert old != new
    assert fetch(old).status_code == 404
    assert fetch(new).status_code == 200
    assert UserPhoto.objects.filter(user=farmer).count() == 1


def test_removing_the_photo_clears_the_address_and_ends_the_link(jwt_client, farmer):
    client = jwt_client(farmer)
    path = send(client, picture()).json()['data']['photoUrl']
    response = client.delete(PHOTO)
    assert response.status_code == 200
    assert response.json()['data']['photoUrl'] is None
    assert fetch(path).status_code == 404
    assert not UserPhoto.objects.exists()
    farmer.refresh_from_db()
    assert not farmer.photo_url


def test_removing_when_there_is_none_says_so(jwt_client, farmer):
    response = jwt_client(farmer).delete(PHOTO)
    assert response.status_code == 404 and response.json()['code'] == 'photo_none'


def test_me_carries_the_address_and_a_wrong_token_is_a_plain_404(jwt_client, farmer):
    client = jwt_client(farmer)
    assert client.get(ME).json()['data']['photoUrl'] in (None, '')
    path = send(client, picture()).json()['data']['photoUrl']
    assert client.get(ME).json()['data']['photoUrl'] == path
    assert fetch('/api/photos/not-a-real-token').status_code == 404


def test_closing_an_account_removes_the_photo_and_ends_the_link(jwt_client, farmer):
    from datetime import timedelta

    from django.conf import settings
    from django.utils import timezone

    path = send(jwt_client(farmer), picture()).json()['data']['photoUrl']
    type(farmer).objects.filter(pk=farmer.pk).update(deletion_requested_at=timezone.now() - timedelta(days=settings.ACCOUNT_DELETION_GRACE_DAYS + 1))
    farmer.refresh_from_db()
    closure.anonymise(farmer)
    assert fetch(path).status_code == 404
    assert not UserPhoto.objects.exists()


# ── who is sent the address ──────────────────────────────────────────────────────────────────

def test_the_address_goes_to_the_people_who_may_see_the_person_and_to_nobody_else(jwt_client):
    coop, other = CooperativeFactory(), CooperativeFactory()
    farmer = UserFactory(cooperative=coop)
    fellow = UserFactory(cooperative=coop)
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    outsider_supervisor = UserFactory(role='SUPERVISOR', cooperative=other)
    admin = UserFactory(role='ADMIN')
    path = send(jwt_client(farmer), picture()).json()['data']['photoUrl']
    farmer.refresh_from_db()

    def row(viewer):
        return person_row(viewer, farmer, visible_phone_ids(viewer, [farmer.pk]))

    assert row(farmer)['photo_url'] == path
    assert row(supervisor)['photo_url'] == path
    assert row(admin)['photo_url'] == path
    assert 'photo_url' not in row(fellow)
    assert 'photo_url' not in row(outsider_supervisor)


def test_a_farmer_is_sent_the_photo_of_their_own_supervisor(jwt_client):
    coop = CooperativeFactory()
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop, name='Claire Uwimana')
    farmer = UserFactory(cooperative=coop)
    path = send(jwt_client(supervisor), picture()).json()['data']['photoUrl']
    block = jwt_client(farmer).get(ME).json()['data']['supervisor']
    assert block['photoUrl'] == path


def test_a_supervisor_who_left_is_no_longer_sent_the_photo_of_a_farmer(jwt_client):
    coop = CooperativeFactory()
    farmer = UserFactory(cooperative=coop)
    supervisor = UserFactory(role='SUPERVISOR', cooperative=coop)
    send(jwt_client(farmer), picture())
    farmer.refresh_from_db()
    farmer.cooperative = None
    farmer.save(update_fields=['cooperative'])
    assert not CooperativeMembership.objects.filter(user=farmer, ended_at__isnull=True).exists()
    assert 'photo_url' not in person_row(supervisor, farmer, visible_phone_ids(supervisor, [farmer.pk]))


# ── the other ways in ────────────────────────────────────────────────────────────────────────

def test_a_visitor_with_no_sign_in_cannot_add_or_remove_a_photo():
    client = APIClient()
    assert client.patch(PHOTO, {}, format='multipart').status_code == 401
    assert client.delete(PHOTO).status_code == 401


def test_support_access_cannot_add_or_remove_a_photo():
    admin, person = admin_and_person()
    token, _ = acting(admin, person)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    for response in (send(client, picture()), client.delete(PHOTO)):
        assert response.status_code == 403
        assert response.json()['code'] == 'support_blocked'


@pytest.mark.throttle
def test_adding_a_photo_is_limited_to_twenty_an_hour(jwt_client, farmer):
    client = jwt_client(farmer)
    body = picture((50, 50))
    codes = [send(client, body).status_code for _ in range(21)]
    assert codes[:20] == [200] * 20 and codes[20] == 429


def test_the_rates_are_in_the_settings():
    from django.conf import settings
    rates = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
    assert rates['photo_upload'] == '20/hour'
    assert rates['photo_file'] == '300/minute'


def test_the_new_texts_exist_in_three_languages():
    for key in ('erPhotoNotImage', 'erPhotoTooLarge', 'erPhotoMissing', 'erPhotoNone'):
        texts = {lang: t(lang, key) for lang in ('en', 'fr', 'rw')}
        assert all(texts.values()), key
        assert len(set(texts.values())) == 3, key


def test_a_photo_is_quick_to_process_even_when_big():
    started = time.perf_counter()
    process_photo(SimpleUploadedFile('a.jpg', picture((4000, 3000)), 'image/jpeg'))
    assert time.perf_counter() - started < 3
