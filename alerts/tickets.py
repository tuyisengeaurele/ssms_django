"""Short-lived, single-use tickets for the live alert stream.

A browser's EventSource cannot send an Authorization header, so it used to put the sign in token in
the URL, where it ends up in logs and history. Instead the signed in page asks for a ticket, which is
good for 30 seconds and one connection, and puts that in the URL.
"""
import hashlib
import secrets

from django.contrib.auth import get_user_model
from django.core.cache import cache

TICKET_SECONDS = 30


def _key(ticket: str) -> str:
    return 'sse-ticket:' + hashlib.sha256(ticket.encode()).hexdigest()


def issue_ticket(user) -> str:
    ticket = secrets.token_urlsafe(32)
    cache.set(_key(ticket), user.pk, TICKET_SECONDS)
    return ticket


async def redeem_ticket(ticket: str):
    """The active user a ticket was issued to, or None. The first use burns the ticket."""
    if not ticket:
        return None
    key = _key(ticket)
    user_id = await cache.aget(key)
    # One DELETE statement: of two callers racing with the same ticket, only one sees it removed.
    if user_id is None or not await cache.adelete(key):
        return None
    return await get_user_model().objects.filter(pk=user_id, is_active=True).afirst()
