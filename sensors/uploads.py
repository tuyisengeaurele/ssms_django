"""Checks on a photo before anything is done with it."""
from PIL import Image
from rest_framework.exceptions import ValidationError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 25_000_000

# The format is read from the picture itself. What the browser claims the file is cannot be trusted.
ALLOWED_FORMATS = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}

NOT_A_PHOTO = "We couldn't read that file as a photo. Please choose a JPEG, PNG or WebP image."

# Make Pillow refuse a decompression bomb: a tiny file that unpacks into a gigantic picture.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def validate_image_upload(uploaded_file, max_bytes: int = MAX_UPLOAD_BYTES) -> str:
    """Raise a ValidationError unless the upload is a reasonable JPEG, PNG or WebP photo.

    Returns the image type found in the file, such as 'image/png'. The file is rewound afterwards.
    """
    if uploaded_file.size > max_bytes:
        raise ValidationError(f'That photo is too large. Please choose one under {max_bytes // (1024 * 1024)} MB.')

    try:
        uploaded_file.seek(0)
        image = Image.open(uploaded_file)
        found, (width, height) = image.format, image.size
        image.verify()
    except Exception as exc:
        raise ValidationError(NOT_A_PHOTO) from exc
    finally:
        uploaded_file.seek(0)

    if found not in ALLOWED_FORMATS:
        raise ValidationError(NOT_A_PHOTO)
    if width * height > MAX_PIXELS:
        raise ValidationError('That photo is too large to check. Please use a smaller one.')
    return ALLOWED_FORMATS[found]
