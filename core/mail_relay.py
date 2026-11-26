"""Send mail through the website's mail sender, for a host that cannot reach a mail server itself.

The email is built here as always. The finished message is signed and posted to a small function that runs with the website
(frontend/api/send-mail.ts), and that passes it to Gmail. Choose it with
EMAIL_BACKEND=core.mail_relay.RelayEmailBackend, MAIL_RELAY_URL and MAIL_RELAY_SECRET.
"""
import base64
import hashlib
import hmac
import json
import time
from email.utils import parseaddr

import httpx
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

# The sender has the same limits.
MIN_SECRET_LENGTH = 32
MAX_RECIPIENTS = 20
# The words the sender answers a failure with. Anything else is not repeated, because it could hold an address.
SENDER_CODES = frozenset({'bad_request', 'unauthorized', 'method', 'too_large', 'send_failed', 'not_set_up'})


class RelayError(Exception):
    """A send that failed. It carries one short code and nothing else, so it is safe to log."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def is_set_up() -> bool:
    return bool(settings.MAIL_RELAY_URL) and len(settings.MAIL_RELAY_SECRET) >= MIN_SECRET_LENGTH


def sign(secret: str, timestamp: str, body: bytes) -> str:
    return hmac.new(secret.encode(), timestamp.encode() + b'.' + body, hashlib.sha256).hexdigest()


def _post(recipients: list, raw: str) -> None:
    body = json.dumps({'to': recipients, 'raw': raw}, separators=(',', ':')).encode()
    timestamp = str(int(time.time()))
    headers = {
        'content-type': 'application/json',
        'x-ssms-timestamp': timestamp,
        'x-ssms-signature': sign(settings.MAIL_RELAY_SECRET, timestamp, body),
    }
    # The errors underneath are dropped (`from None`) because they can name the address that was asked.
    try:
        answer = httpx.post(
            settings.MAIL_RELAY_URL, content=body, headers=headers,
            timeout=settings.MAIL_RELAY_TIMEOUT, follow_redirects=False,
        )
    except httpx.TimeoutException:
        raise RelayError('timeout') from None
    except (httpx.HTTPError, httpx.InvalidURL):
        raise RelayError('unreachable') from None

    try:
        told = answer.json()
    except ValueError:
        told = None
    told = told if isinstance(told, dict) else {}
    if answer.status_code == 200 and told.get('ok') is True:
        return
    code = told.get('error')
    raise RelayError(code if isinstance(code, str) and code in SENDER_CODES else 'refused')


class RelayEmailBackend(BaseEmailBackend):
    """A Django email backend. It never sends a message twice by itself: a late answer may follow a message that left."""

    def send_messages(self, email_messages) -> int:
        sent = 0
        for message in email_messages:
            recipients = [parseaddr(address)[1] for address in message.recipients()]
            if not recipients:
                continue
            try:
                if not is_set_up():
                    raise RelayError('not_set_up')
                raw = base64.b64encode(message.message().as_bytes(linesep='\r\n')).decode('ascii')
                for start in range(0, len(recipients), MAX_RECIPIENTS):
                    _post(recipients[start:start + MAX_RECIPIENTS], raw)
            except RelayError:
                if not self.fail_silently:
                    raise
                continue
            sent += 1
        return sent
