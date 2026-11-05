"""The test buttons on the Health tab. Each one tries one real thing and reports a short word for what happened.

None of them touches a farmer's data or writes to anyone but the admin who pressed it:
* email goes to that admin's own address;
* storage uploads a one pixel picture, always under the same name, so tests never pile pictures up;
* the disease check is sent a small picture made here;
* the database write is rolled back;
* the device test builds a throwaway farm, room and device, takes a reading through the same code a device uses, and
  rolls everything back.

An answer is `{'ok': bool, 'outcome': word}`. The words are plain codes the screen puts into the person's language.
Nothing about an address, a key or the text of an error goes in an answer.
"""
import io
import logging
import secrets

import cloudinary
import cloudinary.uploader
import httpx
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from PIL import Image

from core.mail import Email, send_email
from farms.models import Farm, RearingRoom
from logs.models import HealthCheckResult
from sensors.devices import record_device_reading
from sensors.models import IoTDevice

logger = logging.getLogger(__name__)

AI_TEST_TIMEOUT = 10.0
# Photo storage does not allow an unsigned upload to be deleted, so every test uploads this one picture under this name.
STORAGE_TEST_PICTURE = 'health-test-pixel'


def _png(size: int, colour=(34, 110, 60)) -> bytes:
    buffer = io.BytesIO()
    Image.new('RGB', (size, size), colour).save(buffer, 'PNG')
    return buffer.getvalue()


def test_email(user) -> dict:
    email = Email(
        heading='SSMS email test',
        reason='You received this because you pressed the email test on the System page.',
        greeting=f'Hello {user.name or user.email},',
        intro=('This message was sent by the email test. If you can read it, SSMS can send email.',),
    )
    try:
        send_email('SSMS email test', [user.email], email, fail_silently=False)
    except Exception:
        logger.exception('The email test could not send')
        return {'ok': False, 'outcome': 'failed'}
    # A local machine prints its mail instead of sending it. That works, and it is said plainly.
    return {'ok': True, 'outcome': 'sent' if 'smtp' in settings.EMAIL_BACKEND.lower() else 'printed'}


def test_storage(user) -> dict:
    """Upload one pixel. An unsigned upload cannot be taken down again, so it is always the same picture."""
    if not settings.CLOUDINARY_CLOUD_NAME or not settings.CLOUDINARY_UPLOAD_PRESET:
        return {'ok': False, 'outcome': 'not_set_up'}
    try:
        cloudinary.config(cloud_name=settings.CLOUDINARY_CLOUD_NAME)
        cloudinary.uploader.unsigned_upload(
            _png(1), settings.CLOUDINARY_UPLOAD_PRESET, folder='ssms/health-test', public_id=STORAGE_TEST_PICTURE,
            resource_type='image',
        )
    except Exception:
        logger.exception('The storage test could not upload')
        return {'ok': False, 'outcome': 'failed'}
    return {'ok': True, 'outcome': 'stored'}


def test_disease_check(user) -> dict:
    headers = {'X-Internal-Secret': settings.AI_SERVICE_SECRET} if settings.AI_SERVICE_SECRET else {}
    try:
        answer = httpx.post(
            f'{settings.AI_SERVICE_URL.rstrip("/")}/predict',
            files={'file': ('health-test.png', _png(64), 'image/png')},
            headers=headers, timeout=AI_TEST_TIMEOUT,
        )
    except httpx.TimeoutException:
        return {'ok': False, 'outcome': 'timeout'}
    except Exception:
        return {'ok': False, 'outcome': 'unreachable'}
    try:
        said_something = answer.status_code == 200 and isinstance(answer.json(), dict) and 'result' in answer.json()
    except ValueError:
        said_something = False
    return {'ok': said_something, 'outcome': 'answered' if said_something else 'bad_answer'}


def test_database_write(user) -> dict:
    try:
        with transaction.atomic():
            HealthCheckResult.objects.create(service='database-write-test', status='ok', checked_at=timezone.now())
            transaction.set_rollback(True)
    except Exception:
        logger.exception('The database write test failed')
        return {'ok': False, 'outcome': 'failed'}
    return {'ok': True, 'outcome': 'written'}


def test_device_ingest(user) -> dict:
    try:
        with transaction.atomic():
            farm = Farm.objects.create(owner=user, name='SSMS health test', location='Health test')
            room = RearingRoom.objects.create(farm=farm, name='Health test room')
            device = IoTDevice.objects.create(
                farm=farm, room=room, name='Health test device', device_key=f'health-test-{secrets.token_hex(8)}',
            )
            record_device_reading(device, room, 24.0, 70.0)
            # Nothing of this stays: no farm, no room, no device, no reading and no alert.
            transaction.set_rollback(True)
    except Exception:
        logger.exception('The device intake test failed')
        return {'ok': False, 'outcome': 'failed'}
    return {'ok': True, 'outcome': 'accepted'}


TESTS = {
    'email': test_email,
    'storage': test_storage,
    'disease-check': test_disease_check,
    'database-write': test_database_write,
    'device-ingest': test_device_ingest,
}
