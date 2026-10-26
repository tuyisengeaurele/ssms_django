"""
Live alerts: GET /api/alerts/stream?ticket=<ticket>

Server-Sent Events, served by an async view so a connected browser costs a coroutine and not a
worker. Get a ticket first with POST /api/alerts/stream-ticket. The stream follows the same access
rules as the rest of the API, checks every few seconds that the person is still active, and ends
by itself after MAX_STREAM_SECONDS. The page then reconnects with a fresh ticket.
"""
import asyncio
import json
import time
from datetime import timedelta

from django.http import JsonResponse, StreamingHttpResponse
from django.utils import timezone

from core.access import scope_by_batch

from .models import AlertLog
from .tickets import redeem_ticket

POLL_SECONDS = 5
PING_SECONDS = 30
MAX_STREAM_SECONDS = 600


def _payload(alert) -> dict:
    return {
        'id':        alert.id,
        'type':      alert.type,
        'message':   alert.message,
        'batchId':   alert.batch_id,
        'isRead':    alert.is_read,
        'createdAt': alert.created_at.isoformat(),
    }


async def _events(user):
    since = timezone.now() - timedelta(hours=24)
    started = last_ping = time.monotonic()

    while True:
        # Someone turned off mid stream stops receiving alerts at the next check.
        user = await type(user).objects.filter(pk=user.pk, is_active=True).afirst()
        if user is None:
            return

        checked_at = timezone.now()
        fresh = scope_by_batch(user, AlertLog.objects.filter(created_at__gt=since).order_by('created_at'))
        async for alert in fresh:
            yield f'data: {json.dumps(_payload(alert))}\n\n'
        since = checked_at

        now = time.monotonic()
        if now - started >= MAX_STREAM_SECONDS:
            return
        if now - last_ping >= PING_SECONDS:
            yield ': ping\n\n'
            last_ping = now
        await asyncio.sleep(POLL_SECONDS)


async def alert_stream(request):
    user = await redeem_ticket(request.GET.get('ticket', ''))
    if user is None or user.role not in ('SUPERVISOR', 'ADMIN'):
        return JsonResponse({'success': False, 'message': 'Your session has ended. Please sign in again.'}, status=401)

    response = StreamingHttpResponse(_events(user), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'   # tell proxies not to hold the stream back
    return response
