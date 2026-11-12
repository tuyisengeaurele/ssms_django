"""Where browsers report what the content security policy blocked: POST /api/csp-report.

A browser sends the report by itself, without signing in, so this endpoint is open to anyone and must stay harmless. It keeps
one line in the security events (the rule, what was blocked, which page) and nothing that could identify a visitor or carry a
secret: no query string (it can hold a token), no full policy text, no source code of the page. It ignores reports caused by
browser extensions, which the site cannot fix, and it keeps a repeated report only once an hour.

It always answers 204, because the browser does nothing with the answer and a different one would only tell a stranger which
reports were kept.
"""
import hashlib
from urllib.parse import urlsplit

from django.core.cache import caches
from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from logs.security import record_security_event

from .throttles import CspReportThrottle

MAX_BODY_BYTES = 8192
SAME_REPORT_SECONDS = 3600
PAGE_PATH_LIMIT = 120

# A resource the page cannot choose or fix: it comes from a browser extension.
IGNORED_SCHEMES = {'chrome-extension', 'moz-extension', 'safari-extension', 'safari-web-extension', 'about'}
# What a browser writes instead of an address for these.
KEYWORDS = {'inline', 'eval', 'data', 'blob', 'self', 'filesystem', 'wasm-eval'}
NETWORK_SCHEMES = {'http', 'https', 'ws', 'wss'}


class CspReportParser(JSONParser):
    media_type = 'application/csp-report'


class ReportingApiParser(JSONParser):
    media_type = 'application/reports+json'


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ''


def _blocked(raw: str) -> str | None:
    """What was blocked: a host, or a keyword like `inline`. None when the cause is a browser extension."""
    raw = _text(raw)
    if raw in KEYWORDS:
        return raw
    parts = urlsplit(raw)
    if parts.scheme in IGNORED_SCHEMES or raw in IGNORED_SCHEMES:
        return None
    if parts.scheme in NETWORK_SCHEMES and parts.hostname:
        return f'{parts.scheme}://{parts.hostname}'
    return (parts.scheme or raw.split(':', 1)[0] or 'unknown')[:30]


def _page(raw: str) -> str:
    """The path of the page, without a query string, a fragment or the host."""
    path = urlsplit(_text(raw)).path or '/'
    return path[:PAGE_PATH_LIMIT]


def _fields(payload) -> tuple[str, str, str] | None:
    """(directive, blocked, document) from a legacy report, a Reporting API list, or a plain object. None if unusable."""
    if isinstance(payload, list):
        payload = next((item.get('body') for item in payload if isinstance(item, dict) and isinstance(item.get('body'), dict)), None)
    elif isinstance(payload, dict) and isinstance(payload.get('csp-report'), dict):
        payload = payload['csp-report']
    if not isinstance(payload, dict):
        return None
    directive = _text(payload.get('effectiveDirective') or payload.get('effective-directive') or payload.get('violated-directive'))
    blocked = payload.get('blockedURL') if 'blockedURL' in payload else payload.get('blocked-uri')
    document = payload.get('documentURL') or payload.get('document-uri') or ''
    if not directive:
        return None
    return directive.split()[0][:40], _text(blocked), _text(document)


class CspReportView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [CspReportThrottle]
    # Their own parsers: the project's default one rewrites key names such as `blocked-uri`.
    parser_classes = [CspReportParser, ReportingApiParser, JSONParser]

    def post(self, request):
        """POST /api/csp-report: keep one line about what the policy blocked, and answer 204 whatever came."""
        try:
            if int(request.META.get('CONTENT_LENGTH') or 0) > MAX_BODY_BYTES:
                return Response(status=204)
            fields = _fields(request.data)
        except (ParseError, ValueError):
            return Response(status=204)
        if fields is None:
            return Response(status=204)

        directive, raw_blocked, document = fields
        blocked = _blocked(raw_blocked)
        if blocked is None:
            return Response(status=204)

        detail = f'{directive} blocked {blocked} on {_page(document)}'
        # In memory, like the rate limits: a repeated report is not worth a database row, and a restart may keep one twice.
        key = 'csp:' + hashlib.sha256(detail.encode()).hexdigest()
        if caches['throttle'].add(key, 1, SAME_REPORT_SECONDS):
            record_security_event('csp_violation', request, detail=detail)
        return Response(status=204)
