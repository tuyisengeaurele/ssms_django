"""How the API describes itself in OpenAPI.

Most views here are plain `APIView`s that build their answers as dicts, so a stock schema generator can guess no body for
them. This class documents what the code does know, and nothing it would have to invent:

- the summary and description come from the view's docstring;
- the tag is the first part of the path;
- the sign in scheme is the bearer token, and a public view shows no lock;
- every answer is the same envelope (`success`, `message`, `data`), and an error is the same error envelope;
- who may call an operation is read from `core.permissions_table`, the table `RolePermission` itself uses, so the docs
  cannot say something the guard does not do.

An error answer is listed only when it can happen: 401 on a signed in route, 403 when some role is refused, 404 when the
path names a record, 422 on a write, 429 always.
"""
import re

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.openapi import AutoSchema
from drf_spectacular.utils import OpenApiResponse
from rest_framework import permissions, serializers

from .permissions import action_for
from .permissions_table import ROLES, may


class SuccessEnvelope(serializers.Serializer):
    """What every successful answer looks like. The result, when there is one, is in `data`."""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = serializers.JSONField(required=False, allow_null=True)


class ErrorEnvelope(serializers.Serializer):
    """What every refusal looks like. `reference` is a short code to quote to the team, `code` tells cases apart."""

    success = serializers.BooleanField()
    message = serializers.CharField()
    reference = serializers.CharField(required=False)
    errors = serializers.DictField(required=False)
    code = serializers.CharField(required=False)


class JWTScheme(OpenApiAuthenticationExtension):
    target_class = 'core.jwt_authentication.ActiveUserJWTAuthentication'
    name = 'bearerAuth'

    def get_security_definition(self, auto_schema):
        return {
            'type': 'http', 'scheme': 'bearer', 'bearerFormat': 'JWT',
            'description': 'The access token from `POST /api/auth/login`. Send it as `Authorization: Bearer <token>`.',
        }


def roles_for(view, method: str) -> list[str] | None:
    """The roles the permission table lets call this view with this method, or None for a view with no `resource`."""
    resource = getattr(view, 'resource', None)
    if resource is None:
        return None
    action = action_for(view, method)
    return [role for role in ROLES if may(role, resource, action)]


def operation_id(method: str, path: str) -> str:
    """Method and path in camelCase, so two operations on one view (a list and one record) can never share a name.

    Plain letters only: Swagger reads an underscore in a deep link as a space, which a later release drops.
    """
    words = [method.lower()]
    for part in path.removeprefix('/api').split('/'):
        if not part:
            continue
        if part.startswith('{'):
            words += ['by', *re.split(r'[-_]', part[1:-1])]
        else:
            words += re.split(r'[-_]', part)
    return words[0] + ''.join(w[:1].upper() + w[1:] for w in words[1:] if w)


_METHODS = r'(?:GET|POST|PUT|PATCH|DELETE)'
# "GET /api/x/<id>, every thing that ..." and "GET/POST /api/x" and "POST /api/x (staff)".
_ROUTE_LEAD = re.compile(rf'^{_METHODS}(?:\s*[/,]\s*{_METHODS})*\s+\S*/api\S*\s*[,:\-]?\s*')


def _humanize(class_name: str) -> str:
    words = re.sub(r'(?<!^)(?=[A-Z])', ' ', class_name.removesuffix('View')).lower()
    return words[:1].upper() + words[1:]


_STUB = re.compile(r'(?i)(admins?|staff|authenticated users?|farmers?|supervisors?)( and \w+)? only\.?')


def _sentence_for(doc: str, method: str) -> str:
    """The sentence of a docstring that starts with this method ("GET lists the entries, latest day first."), if any."""
    found = re.search(rf'(?:^|[.\n:]\s*){method}\s+(?!/)([a-z][^.\n]*)', doc or '')
    return found.group(1).strip() if found else ''


def summary_from(doc: str, class_name: str, method: str = '') -> str:
    """What the operation does, in a line: the sentence for its own method, else the first line of the docstring without
    the route it starts with, else the class name in words."""
    rest = _sentence_for(doc, method.upper()) if method else ''
    if not rest:
        first = next((line.strip() for line in (doc or '').splitlines() if line.strip()), '')
        rest = _ROUTE_LEAD.sub('', first).strip()
    # What is left must read like a sentence: not a body shape such as "{decision: ...}", not a stub, not too short.
    if not rest or rest[0] in '{[(<' or '{' in rest or len(rest) < 8 or _STUB.fullmatch(rest):
        return _humanize(class_name)
    rest = rest.rstrip('.')
    return rest[:1].upper() + rest[1:]


class SsmsAutoSchema(AutoSchema):
    # A plain APIView has no serializer to read. Say so quietly instead of one error per view.
    def _plain(self) -> bool:
        view = self.view
        return not (callable(getattr(view, 'get_serializer', None)) or callable(getattr(view, 'get_serializer_class', None)) or hasattr(view, 'serializer_class'))

    def _get_serializer(self):
        return None if self._plain() else super()._get_serializer()

    def get_operation_id(self):
        return operation_id(self.method, self.path)

    def get_tags(self):
        return [self._tokenize_path()[0]] if self._tokenize_path() else ['api']

    def get_summary(self):
        return summary_from(self.view.__class__.__doc__ or '', self.view.__class__.__name__, self.method)

    def _roles(self):
        return roles_for(self.view, self.method)

    def get_description(self):
        text = super().get_description() or ''
        roles = self._roles()
        if roles is None:
            line = 'No sign in is needed.' if self._public() else ''
        elif roles:
            line = 'Who may call this: ' + ', '.join(r.capitalize() for r in roles) + '.'
        else:
            line = 'No role may call this.'
        return f'{text}\n\n{line}'.strip() if line else text

    def get_extensions(self):
        roles = self._roles()
        return {'x-roles': roles} if roles is not None else {}

    def _public(self) -> bool:
        return permissions.AllowAny in [p.__class__ for p in self.view.get_permissions()]

    def get_auth(self):
        # A public route shows no lock. (The generator would show a bearer scheme or "none".)
        return [] if self._public() else super().get_auth()

    def get_response_serializers(self):
        base = SuccessEnvelope if self._plain() else super().get_response_serializers()
        answers = {'2XX': OpenApiResponse(base, description='Success. The result, if any, is in `data`.')}
        roles = self._roles()
        locked = bool(self.get_auth())
        if locked:
            answers['401'] = OpenApiResponse(ErrorEnvelope, description='Not signed in, or the session has ended.')
            if roles is not None and set(roles) != set(ROLES):
                answers['403'] = OpenApiResponse(ErrorEnvelope, description='The signed in role may not do this.')
        if '{' in self.path:
            answers['404'] = OpenApiResponse(ErrorEnvelope, description='No such record, or one this person may not reach.')
        if self.method in ('POST', 'PUT', 'PATCH'):
            answers['422'] = OpenApiResponse(ErrorEnvelope, description='What was sent is not valid. `errors` names each field.')
        answers['429'] = OpenApiResponse(ErrorEnvelope, description='Too many requests. Wait and try again.')
        return answers


def _error_ref():
    return {'content': {'application/json': {'schema': {'$ref': '#/components/schemas/ErrorEnvelope'}}}}


def add_plain_routes(result, generator, request, public):
    """Describe the two routes that are plain Django functions, which the generator cannot see.

    A postprocessing hook, so they sit in the same schema as the rest. The roles of the stream come from the table.
    """
    stream_roles = [role for role in ROLES if may(role, 'alerts', 'stream')]
    result['paths']['/api/health'] = {'get': {
        'operationId': 'getHealth',
        'summary': 'Check that the API and its database are up',
        'description': (
            'Open to anyone. The hosting platform and the outside monitor call it. A 503 means the database cannot be '
            'reached. It does not use the answer envelope.\n\nNo sign in is needed.'
        ),
        'tags': ['health'],
        'responses': {
            '200': {'description': 'Up.', 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/HealthStatus'}}}},
            '503': {'description': 'The database cannot be reached.', 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/HealthStatus'}}}},
            '429': {'description': 'Too many requests. Wait and try again.', **_error_ref()},
        },
    }}
    result['paths']['/api/alerts/stream'] = {'get': {
        'operationId': 'getAlertsStream',
        'summary': 'Stream new alerts as server-sent events',
        'description': (
            'Opens an event stream. It is not called with the bearer token: first `POST /api/alerts/stream-ticket` for a '
            'one time ticket, then open this with `?ticket=`. The stream ends after a while and the page opens it again.'
            '\n\nWho may call this: ' + ', '.join(r.capitalize() for r in stream_roles) + '.'
        ),
        'tags': ['alerts'],
        'x-roles': stream_roles,
        'parameters': [{'name': 'ticket', 'in': 'query', 'required': True, 'schema': {'type': 'string'}, 'description': 'The one time ticket.'}],
        'responses': {
            '200': {'description': 'An event stream.', 'content': {'text/event-stream': {'schema': {'type': 'string'}}}},
            '401': {'description': 'The ticket is missing, used or expired, or the role may not stream.', **_error_ref()},
            '429': {'description': 'Too many requests. Wait and try again.', **_error_ref()},
        },
    }}
    result['components']['schemas']['HealthStatus'] = {
        'type': 'object',
        'properties': {
            'status': {'type': 'string', 'enum': ['ok', 'degraded']},
            'database': {'type': 'string', 'enum': ['ok', 'unreachable']},
            'timestamp': {'type': 'string', 'format': 'date-time'},
        },
        'required': ['status', 'database', 'timestamp'],
    }
    return result
