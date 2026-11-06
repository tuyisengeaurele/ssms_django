"""The challenge an admin holds between a correct password and a correct code.

A correct password does not sign an admin in. It hands back this signed value, good for five minutes, naming one person
and one step (`code` when the second factor is on, `setup` when it is not). The mfa endpoints take it and nothing else
does: it is not a JWT, so no other endpoint treats it as a login.

A challenge dies when it is spent, when it expires, or after five wrong codes. Spent and wrong-code state live in the
shared cache, so every worker agrees. The email lockout (core/lockout.py) is the main limit on guessing. This is a second
one that ends a single challenge early.
"""
import secrets
from dataclasses import dataclass

from django.core import signing
from django.core.cache import cache

CHALLENGE_SECONDS = 300
MAX_WRONG = 5
SALT = 'ssms.mfa.challenge'
STEPS = ('code', 'setup')


class ChallengeError(Exception):
    """Expired, changed, spent, dead, or not a challenge at all. The reason is deliberately not given."""


@dataclass(frozen=True)
class Challenge:
    user_id: str
    step: str
    nonce: str


def _key(kind: str, nonce: str) -> str:
    return f'mfa-challenge:{kind}:{nonce}'


def issue(user, step: str) -> str:
    if step not in STEPS:
        raise ValueError(f'step must be one of {STEPS}')
    return signing.dumps({'u': user.pk, 's': step, 'n': secrets.token_urlsafe(16)}, salt=SALT)


def read(token) -> Challenge:
    # A request body can hold anything, so a value that is not text is refused the same way as a bad one.
    if not isinstance(token, str):
        raise ChallengeError('not a good challenge')
    try:
        data = signing.loads(token, salt=SALT, max_age=CHALLENGE_SECONDS)
    except signing.BadSignature as error:   # expired and changed values both land here
        raise ChallengeError('not a good challenge') from error
    if not (isinstance(data, dict) and all(isinstance(data.get(name), str) for name in ('u', 's', 'n')) and data['s'] in STEPS):
        raise ChallengeError('not a good challenge')
    held = Challenge(user_id=data['u'], step=data['s'], nonce=data['n'])
    if cache.get(_key('spent', held.nonce)) or (cache.get(_key('wrong', held.nonce)) or 0) >= MAX_WRONG:
        raise ChallengeError('not a good challenge')
    return held


def spend(held: Challenge) -> None:
    """Used once. It cannot be read again for as long as it could have lived."""
    cache.set(_key('spent', held.nonce), 1, CHALLENGE_SECONDS)


def wrong_code(held: Challenge) -> bool:
    """Count a wrong code. True when this one was the last allowed, so the challenge is now dead."""
    count = (cache.get(_key('wrong', held.nonce)) or 0) + 1
    cache.set(_key('wrong', held.nonce), count, CHALLENGE_SECONDS)
    return count >= MAX_WRONG
