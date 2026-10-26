import io
from unittest import mock

import httpx
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from tests.factories import BatchFactory, FarmFactory, UserFactory

pytestmark = pytest.mark.django_db

URL = '/api/detections'


def image_bytes(fmt='PNG', size=(8, 8)):
    buffer = io.BytesIO()
    Image.new('RGB', size, (20, 120, 60)).save(buffer, fmt)
    return buffer.getvalue()


def upload(data, name='worm.png', content_type='image/png'):
    return SimpleUploadedFile(name, data, content_type=content_type)


@pytest.fixture
def farmer_and_batch():
    farmer = UserFactory()
    return farmer, BatchFactory(farm=FarmFactory(owner=farmer))


def ai_answer(status=200, body=None, text=''):
    answer = mock.MagicMock(status_code=status, text=text)
    answer.json.return_value = body or {'result': 'Healthy', 'confidence': 0.91, 'allScores': {'Healthy': 0.91}}
    return answer


@pytest.fixture
def ai():
    """Stand in for the AI service and for Cloudinary."""
    client = mock.MagicMock()
    client.__enter__.return_value.post.return_value = ai_answer()
    with mock.patch('sensors.detection_views.httpx.Client', return_value=client), \
            mock.patch('sensors.detection_views._upload_to_cloudinary', return_value='https://example.invalid/w.jpg'):
        yield client.__enter__.return_value


def send(auth_client, farmer, batch, file):
    return auth_client(farmer).post(URL, {'batchId': batch.pk, 'image': file}, format='multipart')


# ── what is accepted ────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize('fmt, name', [('PNG', 'a.png'), ('JPEG', 'a.jpg'), ('WEBP', 'a.webp')])
def test_real_photos_in_the_allowed_formats_are_accepted(auth_client, farmer_and_batch, ai, fmt, name):
    response = send(auth_client, *farmer_and_batch, upload(image_bytes(fmt), name))
    assert response.status_code == 201


def test_the_declared_type_is_not_trusted_either_way(auth_client, farmer_and_batch, ai):
    response = send(auth_client, *farmer_and_batch, upload(image_bytes('PNG'), 'a.txt', 'text/plain'))
    assert response.status_code == 201


# ── what is refused ─────────────────────────────────────────────────────────────────────────

def test_a_text_file_renamed_to_jpg_is_refused_before_the_ai_sees_it(auth_client, farmer_and_batch, ai):
    response = send(auth_client, *farmer_and_batch, upload(b'just some text, not a picture', 'x.jpg', 'image/jpeg'))
    assert response.status_code == 422
    assert 'photo' in response.json()['message'].lower()
    ai.post.assert_not_called()


def test_a_photo_over_5_megabytes_is_refused(auth_client, farmer_and_batch, ai):
    big = image_bytes('PNG') + b'\0' * (5 * 1024 * 1024)
    response = send(auth_client, *farmer_and_batch, upload(big))
    assert response.status_code == 422
    assert '5 MB' in response.json()['message']
    ai.post.assert_not_called()


def test_a_gif_is_not_an_allowed_format(auth_client, farmer_and_batch, ai):
    response = send(auth_client, *farmer_and_batch, upload(image_bytes('GIF'), 'a.gif', 'image/gif'))
    assert response.status_code == 422
    ai.post.assert_not_called()


def test_an_enormous_picture_is_refused(auth_client, farmer_and_batch, ai):
    huge = image_bytes('PNG', size=(6000, 6000))  # 36 million pixels but only a few KB on disk
    assert len(huge) < 5 * 1024 * 1024
    response = send(auth_client, *farmer_and_batch, upload(huge))
    assert response.status_code == 422
    ai.post.assert_not_called()


# ── how the AI service is called ────────────────────────────────────────────────────────────

def test_the_secret_travels_in_a_header(auth_client, farmer_and_batch, ai, settings):
    settings.AI_SERVICE_SECRET = 'shared-secret-for-tests'
    send(auth_client, *farmer_and_batch, upload(image_bytes()))
    headers = ai.post.call_args.kwargs['headers']
    assert headers['X-Internal-Secret'] == 'shared-secret-for-tests'


def test_the_photo_is_sent_with_the_type_we_found_not_the_one_claimed(auth_client, farmer_and_batch, ai):
    send(auth_client, *farmer_and_batch, upload(image_bytes('PNG'), 'a.txt', 'text/plain'))
    name, _, content_type = ai.post.call_args.kwargs['files']['file']
    assert content_type == 'image/png'


def test_an_ai_failure_says_nothing_about_the_inside(auth_client, farmer_and_batch, ai):
    ai.post.return_value = ai_answer(status=500, text='Traceback (most recent call last): secret internals at /srv/app')
    response = send(auth_client, *farmer_and_batch, upload(image_bytes()))
    assert response.status_code == 502
    body = response.content.decode()
    assert 'Traceback' not in body and 'secret internals' not in body and '/srv/app' not in body


def test_an_unexpected_error_is_not_echoed_either(auth_client, farmer_and_batch, ai):
    ai.post.side_effect = RuntimeError('connection string postgres://user:hunter2@db/prod')
    response = send(auth_client, *farmer_and_batch, upload(image_bytes()))
    assert response.status_code == 502
    assert 'hunter2' not in response.content.decode()


def test_an_ai_service_that_is_down_is_a_calm_503(auth_client, farmer_and_batch, ai):
    ai.post.side_effect = httpx.ConnectError('refused')
    response = send(auth_client, *farmer_and_batch, upload(image_bytes()))
    assert response.status_code == 503


def test_a_batch_outside_scope_is_a_404_before_any_photo_work(auth_client, ai):
    stranger_batch = BatchFactory()
    response = send(auth_client, UserFactory(), stranger_batch, upload(image_bytes()))
    assert response.status_code == 404
    ai.post.assert_not_called()
