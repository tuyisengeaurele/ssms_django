"""The building blocks of the admin second factor: the secret kept encrypted, the 6 digit codes, and recovery codes.

Nothing here writes a secret, a code or a recovery code to a log. The views that call it must not either.
"""
import hmac
import secrets
import time

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import RecoveryCode, SecondFactor

STEP_SECONDS = 30
RECOVERY_COUNT = 8
ISSUER = 'SSMS'

# No 0, O, 1, I or L, so a code read off paper cannot be mistaken.
_RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'


class MfaKeyError(Exception):
    """The encryption key is missing, invalid, or not the one that locked this secret."""


def _fernet() -> Fernet:
    try:
        return Fernet(settings.MFA_ENCRYPTION_KEY)
    except (ValueError, TypeError) as error:
        raise MfaKeyError('The encryption key is missing or is not valid.') from error


def encrypt(text: str) -> str:
    return _fernet().encrypt(text.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as error:
        raise MfaKeyError('This secret was not locked with the current key.') from error


def new_secret() -> str:
    return pyotp.random_base32()


def otpauth_uri(user, secret: str) -> str:
    """What the QR code holds. The phone shows the issuer and the email next to the code."""
    return pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=ISSUER)


def is_enabled(user) -> bool:
    return SecondFactor.objects.filter(user=user, enabled_at__isnull=False).exists()


def check_code(factor: SecondFactor, code, *, pending: bool = False, now: float | None = None) -> bool:
    """Is this a good 6 digit code? A step either side of now is accepted, for a clock that is a little off.

    A code is good once. The step it belongs to is saved with a conditional update, so two requests that arrive at the
    same moment with the same code cannot both succeed.
    """
    digits = ''.join(str(code or '').split())
    if len(digits) != 6 or not digits.isdigit():
        return False
    stored = factor.pending_secret_encrypted if pending else factor.secret_encrypted
    if not stored:
        return False
    totp = pyotp.TOTP(decrypt(stored), interval=STEP_SECONDS)
    current = int((time.time() if now is None else now) // STEP_SECONDS)
    for step in (current - 1, current, current + 1):
        if step <= factor.last_step:
            continue
        if secrets.compare_digest(totp.at(step * STEP_SECONDS), digits):
            if SecondFactor.objects.filter(pk=factor.pk, last_step__lt=step).update(last_step=step) != 1:
                return False
            factor.last_step = step
            return True
    return False


def _hash(code: str) -> str:
    normalised = ''.join(ch for ch in str(code).upper() if ch.isalnum())
    return hmac.new(settings.SECRET_KEY.encode(), normalised.encode(), 'sha256').hexdigest()


def new_recovery_codes(user) -> list[str]:
    """Replace every recovery code with new ones. The plain codes are returned once and kept nowhere."""
    codes: list[str] = []
    while len(codes) < RECOVERY_COUNT:
        raw = ''.join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
        code = f'{raw[:5]}-{raw[5:]}'
        if code not in codes:
            codes.append(code)
    with transaction.atomic():
        RecoveryCode.objects.filter(user=user).delete()
        RecoveryCode.objects.bulk_create([RecoveryCode(user=user, code_hash=_hash(code)) for code in codes])
    return codes


def use_recovery_code(user, code) -> bool:
    """Spend a recovery code. Case, spaces and the dash do not matter. The update is conditional, so a code works once."""
    if not code:
        return False
    return RecoveryCode.objects.filter(user=user, code_hash=_hash(code), used_at__isnull=True).update(used_at=timezone.now()) == 1


def recovery_codes_left(user) -> int:
    return RecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


def reset(user) -> None:
    """Back to the start: no second factor and no recovery codes. The next admin sign in goes through set-up."""
    with transaction.atomic():
        SecondFactor.objects.filter(user=user).delete()
        RecoveryCode.objects.filter(user=user).delete()
