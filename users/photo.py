"""A profile photo: checked by what is in the file, cropped square, at most 512 px, stripped of location data, saved as WebP.

The picture is rebuilt from its pixels alone, so nothing else in the file (the camera, the time, the place) can come along. A
photo taken sideways is turned upright first, because the turn is one of the things that is dropped.
"""
import io
import secrets

from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError

from .models import User, UserPhoto

MAX_BYTES = 2 * 1024 * 1024
SIDE = 512
# A small file can claim a huge picture. Anything over this many pixels is refused before it is decoded.
MAX_PIXELS = 40_000_000
ALLOWED = {'JPEG', 'MPO', 'PNG', 'WEBP'}   # MPO is how some phones label an ordinary JPEG
PATH = '/api/photos/'

NOT_AN_IMAGE = 'Please choose a JPEG, PNG or WebP photo.'
TOO_LARGE = 'That photo is too large. Please choose one under 2 MB.'
NOTHING_CHOSEN = 'Please choose a photo.'
NOTHING_TO_REMOVE = 'There is no photo to remove.'


class PhotoError(Exception):
    """A refusal with a sentence, an HTTP status and a code the page tells cases apart by."""

    def __init__(self, message: str, status: int = 422, code: str = 'photo_error'):
        super().__init__(message)
        self.message, self.status, self.code = message, status, code


def process_photo(upload) -> bytes:
    """The WebP bytes of the photo, or a PhotoError. The file is judged by its content, never by its name or its type."""
    if upload is None:
        raise PhotoError(NOTHING_CHOSEN, 422, 'photo_missing')
    if upload.size > MAX_BYTES:
        raise PhotoError(TOO_LARGE, 422, 'photo_too_large')
    raw = upload.read(MAX_BYTES + 1)
    try:
        image = Image.open(io.BytesIO(raw))
        if image.format not in ALLOWED:
            raise PhotoError(NOT_AN_IMAGE, 422, 'photo_not_image')
        width, height = image.size
        if width * height > MAX_PIXELS:
            raise PhotoError(TOO_LARGE, 422, 'photo_too_large')
        image.load()
    except PhotoError:
        raise
    except Image.DecompressionBombError:
        # Another part of the app sets Pillow's own limit lower than ours, and then Pillow refuses first.
        raise PhotoError(TOO_LARGE, 422, 'photo_too_large') from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise PhotoError(NOT_AN_IMAGE, 422, 'photo_not_image') from None

    image = ImageOps.exif_transpose(image)
    mode = 'RGBA' if 'A' in image.getbands() else 'RGB'
    image = image.convert(mode)
    width, height = image.size
    side = min(width, height)
    left, top = (width - side) // 2, (height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    if side > SIDE:
        image = image.resize((SIDE, SIDE), Image.LANCZOS)
    clean = Image.frombytes(mode, image.size, image.tobytes())   # the pixels and nothing else
    out = io.BytesIO()
    clean.save(out, 'WEBP', quality=82, method=4)
    return out.getvalue()


def photo_path(token: str) -> str:
    return f'{PATH}{token}'


def set_photo(user, upload) -> User:
    """Replace the person's photo. The new one gets a new address, and the old address stops working."""
    data = process_photo(upload)
    token = secrets.token_urlsafe(32)
    with transaction.atomic():
        UserPhoto.objects.update_or_create(user=user, defaults={'token': token, 'data': data, 'content_type': 'image/webp'})
        user.photo_url = photo_path(token)
        user.save(update_fields=['photo_url', 'updated_at'])
    return user


def remove_photo(user) -> User:
    """Take the photo away. Its address stops working at once."""
    removed, _ = UserPhoto.objects.filter(user=user).delete()
    if not removed and not user.photo_url:
        raise PhotoError(NOTHING_TO_REMOVE, 404, 'photo_none')
    user.photo_url = None
    user.save(update_fields=['photo_url', 'updated_at'])
    return user
