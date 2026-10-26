"""One place that makes record ids. They use the secrets module, so they cannot be guessed."""
import secrets
import string
import time

_ALPHABET = string.ascii_lowercase + string.digits


def new_id() -> str:
    """A cuid-like id: 'c', the time in milliseconds as hex, then 16 random characters."""
    stamp = format(int(time.time() * 1000), 'x')
    suffix = ''.join(secrets.choice(_ALPHABET) for _ in range(16))
    return f'c{stamp}{suffix}'
