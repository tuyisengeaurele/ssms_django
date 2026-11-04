import logging
import random
import time

from django.conf import settings

from .models import RequestLog

logger = logging.getLogger(__name__)

# The probe a host asks every few seconds says nothing, so it is never written.
NEVER = ('/api/health',)


class RequestLogMiddleware:
    """Writes a row for every failed request and for a sample of the good ones.

    What goes in: the reference, the method, the route pattern, the status, how long it took, who asked and from where.
    What never goes in: the address that was typed (a lot token or an invitation link can be in it), the query, the
    headers or the body. A problem writing the row is logged and never reaches the person.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.monotonic()
        response = self.get_response(request)
        try:
            self._note(request, response, started)
        except Exception:
            logger.exception('Could not write the request log')
        return response

    def _note(self, request, response, started):
        if request.path in NEVER:
            return
        failed = response.status_code >= 400
        if not failed and random.random() >= settings.REQUEST_LOG_SAMPLE_RATE:
            return
        user = getattr(request, 'user', None)
        known = user is not None and getattr(user, 'is_authenticated', False)
        match = getattr(request, 'resolver_match', None)
        from core.net import get_client_ip
        RequestLog.objects.create(
            request_id=getattr(request, 'request_id', ''),
            method=request.method[:10],
            route=(getattr(match, 'route', '') or '(unmatched)')[:200],
            status=response.status_code,
            duration_ms=int((time.monotonic() - started) * 1000),
            user_id=user.pk if known else None,
            role=user.role if known else '',
            ip_address=get_client_ip(request),
        )
