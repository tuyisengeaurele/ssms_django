from django.utils.deprecation import MiddlewareMixin

# The API only returns JSON and event streams, so a browser has no reason to load anything from
# one of its responses or to show one in a frame.
CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'"
PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=()'


class SecurityHeadersMiddleware(MiddlewareMixin):
    """Adds a Content-Security-Policy and a Permissions-Policy to every response."""

    def process_response(self, request, response):
        response.headers.setdefault('Content-Security-Policy', CONTENT_SECURITY_POLICY)
        response.headers.setdefault('Permissions-Policy', PERMISSIONS_POLICY)
        return response
