"""The API's own documentation: the schema as JSON and a Swagger page to read it.

Plain Django views, because they are not part of the API they describe. The page loads Swagger UI from files shipped
with `drf-spectacular-sidecar` and served here, so it needs no CDN and the strict policy of the rest of the API only
loosens for this one page, with a script nonce that changes on every response. Switch all three off with
`API_DOCS_ENABLED=false`.
"""
import functools
import secrets
from pathlib import Path

import drf_spectacular_sidecar
from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_safe
from drf_spectacular.generators import SchemaGenerator

_DIST = Path(drf_spectacular_sidecar.__file__).parent / 'static' / 'drf_spectacular_sidecar' / 'swagger-ui-dist'
# The only files the page needs. A fixed list, so no name from a request is ever turned into a path.
ASSETS = {
    'swagger-ui.css': 'text/css',
    'swagger-ui-bundle.js': 'application/javascript',
}

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SSMS API | Documentation</title>
<link rel="stylesheet" href="/api/docs/assets/swagger-ui.css">
</head>
<body>
<div id="swagger-ui"></div>
<script nonce="{nonce}" src="/api/docs/assets/swagger-ui-bundle.js"></script>
<script nonce="{nonce}">
window.ui = SwaggerUIBundle({{
  url: '/api/schema/',
  dom_id: '#swagger-ui',
  deepLinking: true,
  tryItOutEnabled: false,
  persistAuthorization: false,
}});
</script>
</body>
</html>
"""


def _enabled():
    if not settings.API_DOCS_ENABLED:
        raise Http404


@functools.lru_cache(maxsize=1)
def _schema() -> dict:
    """Built once per process. The schema only changes with a deploy."""
    return SchemaGenerator().get_schema(request=None, public=True)


@require_safe
def schema_view(request):
    _enabled()
    response = JsonResponse(_schema())
    response['Cache-Control'] = 'public, max-age=300'
    return response


@require_safe
def docs_view(request):
    _enabled()
    nonce = secrets.token_urlsafe(16)
    response = HttpResponse(PAGE.format(nonce=nonce), content_type='text/html; charset=utf-8')
    # Only this page may run its own script, and only with this response's nonce. Nothing is fetched from another host.
    response['Content-Security-Policy'] = (
        f"default-src 'none'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )
    response['Cache-Control'] = 'no-store'
    return response


@require_safe
def asset_view(request, name):
    _enabled()
    content_type = ASSETS.get(name)
    if content_type is None:
        raise Http404
    response = FileResponse(open(_DIST / name, 'rb'), content_type=content_type)
    response['Cache-Control'] = 'public, max-age=86400'
    return response
