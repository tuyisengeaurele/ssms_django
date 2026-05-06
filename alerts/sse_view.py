"""
Server-Sent Events endpoint — GET /api/alerts/stream?token=<jwt>

Streams new AlertLog records to connected supervisors/admins in real time.
Polls the DB every 5 s; sends a keep-alive comment every 30 s so proxies
and browsers do not close the connection.

Authentication:
    EventSource cannot send custom headers, so the JWT is passed as the
    `token` query-string parameter instead of the Authorization header.
"""

import json
import time
from datetime import timedelta

from django.http import StreamingHttpResponse
from django.utils import timezone
from django.views import View
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .models import AlertLog

POLL_INTERVAL  = 5   # seconds between DB polls
PING_INTERVAL  = 30  # seconds between keep-alive pings


def _user_from_token(token_str: str):
    """Validate a JWT and return the User, or None if invalid."""
    if not token_str:
        return None
    try:
        token = AccessToken(token_str)
        from django.contrib.auth import get_user_model
        return get_user_model().objects.get(pk=token['user_id'])
    except (TokenError, Exception):
        return None


class AlertStreamView(View):
    """
    GET /api/alerts/stream?token=<jwt>
    """

    def get(self, request):
        user = _user_from_token(request.GET.get('token', ''))

        if not user or user.role not in ('SUPERVISOR', 'ADMIN'):
            def _deny():
                yield 'event: error\ndata: {"detail": "Unauthorized"}\n\n'
            return StreamingHttpResponse(
                _deny(), content_type='text/event-stream', status=401
            )

        response = StreamingHttpResponse(
            self._stream(),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'   # disable nginx / gunicorn buffering
        return response

    def _stream(self):
        # Seed: deliver all unread alerts from the last 24 hours on connect
        since = timezone.now() - timedelta(hours=24)
        last_ping = time.time()

        while True:
            # ── new alerts since last check ───────────────────────────────
            check_at  = timezone.now()
            new_alerts = (
                AlertLog.objects
                .filter(created_at__gt=since)
                .order_by('created_at')
            )

            for alert in new_alerts:
                payload = {
                    'id':        alert.id,
                    'type':      alert.type,
                    'message':   alert.message,
                    'batchId':   alert.batch_id,
                    'isRead':    alert.is_read,
                    'createdAt': alert.created_at.isoformat(),
                }
                yield f'data: {json.dumps(payload)}\n\n'

            # Advance the cursor so we never re-send the same alert
            since = check_at

            # ── keep-alive ping ───────────────────────────────────────────
            if time.time() - last_ping >= PING_INTERVAL:
                yield ': ping\n\n'
                last_ping = time.time()

            time.sleep(POLL_INTERVAL)
