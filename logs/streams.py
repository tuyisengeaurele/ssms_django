"""The four log streams as the Logs page shows them: what each one lists, how it filters and what its CSV holds.

Every stream has the same filters where they make sense: a date range, a reference (the reference one request carries
through every log) and a search. The rest belongs to the stream.
"""
from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone

from audit_log.models import AuditLog
from core.params import ParamError, date_param

from .models import JobLog, RequestLog, SecurityEvent
from .security import KINDS

STATUS_CLASS = {'2xx': (200, 300), '3xx': (300, 400), '4xx': (400, 500), '5xx': (500, 600)}
FILTER_NAMES = ('from', 'to', 'reference', 'search', 'user', 'kind', 'status', 'route', 'method', 'outcome', 'action', 'resource')


def _day_start(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def _text(request, name: str) -> str:
    return request.query_params.get(name, '').strip()[:200]


class Stream:
    name = ''
    model = None
    csv_header: list = []
    # The columns a typed search looks in.
    search_columns: tuple = ()

    def queryset(self):
        return self.model.objects.all()

    def filter(self, qs, request):
        start, end = date_param(request, 'from'), date_param(request, 'to')
        if start and end and start > end:
            raise ParamError('The "from" date must not be after the "to" date.')
        if start:
            qs = qs.filter(created_at__gte=_day_start(start))
        if end:
            qs = qs.filter(created_at__lt=_day_start(end) + timedelta(days=1))
        if reference := _text(request, 'reference'):
            qs = qs.filter(request_id__iexact=reference)
        if (search := _text(request, 'search')) and self.search_columns:
            match = Q()
            for column in self.search_columns:
                match |= Q(**{f'{column}__icontains': search})
            qs = qs.filter(match)
        return qs.order_by('-created_at', '-id')

    def filters_used(self, request) -> list:
        """The names of the filters in the request, not what was typed in them."""
        return sorted(name for name in FILTER_NAMES if _text(request, name))


class AuditStream(Stream):
    name = 'audit'
    model = AuditLog
    search_columns = ('detail', 'user_email', 'resource', 'resource_id')
    csv_header = ['ID', 'Time', 'Person', 'Action', 'Resource', 'Resource ID', 'Detail', 'Outcome', 'On behalf of', 'Device', 'Address', 'Reference', 'Changes']

    def filter(self, qs, request):
        qs = super().filter(qs, request)
        if user := _text(request, 'user'):
            qs = qs.filter(Q(user_email__icontains=user) | Q(user_name__icontains=user))
        if outcome := _text(request, 'outcome'):
            qs = qs.filter(outcome=outcome)
        if action := _text(request, 'action'):
            qs = qs.filter(action=action.upper())
        if resource := _text(request, 'resource'):
            qs = qs.filter(resource__iexact=resource)
        return qs

    def serialize(self, row):
        return {
            'id': row.id, 'created_at': row.created_at, 'user_name': row.user_name, 'user_email': row.user_email,
            'action': row.action, 'resource': row.resource, 'resource_id': row.resource_id, 'detail': row.detail,
            'outcome': row.outcome, 'on_behalf_of_email': row.on_behalf_of_email, 'device_label': row.device_label,
            'ip_address': row.ip_address, 'request_id': row.request_id, 'changes': row.changes,
        }

    def csv_row(self, row):
        changes = '; '.join(f'{k}: {v["from"]} -> {v["to"]}' for k, v in (row.changes or {}).items())
        return [
            row.id, row.created_at.isoformat(), row.user_email, row.action, row.resource, row.resource_id, row.detail,
            row.outcome, row.on_behalf_of_email, row.device_label, row.ip_address or '', row.request_id, changes,
        ]


class SecurityStream(Stream):
    name = 'security'
    model = SecurityEvent
    search_columns = ('detail', 'user_email')
    csv_header = ['ID', 'Time', 'Kind', 'Event', 'Person', 'Address', 'Reference', 'Detail']

    def filter(self, qs, request):
        qs = super().filter(qs, request)
        if kind := _text(request, 'kind'):
            qs = qs.filter(kind=kind)
        if user := _text(request, 'user'):
            qs = qs.filter(user_email__icontains=user)
        return qs

    def serialize(self, row):
        return {
            'id': row.id, 'created_at': row.created_at, 'kind': row.kind, 'label': KINDS.get(row.kind, row.kind),
            'user_email': row.user_email, 'ip_address': row.ip_address, 'request_id': row.request_id, 'detail': row.detail,
        }

    def csv_row(self, row):
        return [
            row.id, row.created_at.isoformat(), row.kind, KINDS.get(row.kind, row.kind), row.user_email,
            row.ip_address or '', row.request_id, row.detail,
        ]


class RequestStream(Stream):
    name = 'requests'
    model = RequestLog
    search_columns = ('route',)
    csv_header = ['ID', 'Time', 'Reference', 'Method', 'Route', 'Status', 'Milliseconds', 'Role', 'Address']

    def filter(self, qs, request):
        qs = super().filter(qs, request)
        if status := _text(request, 'status'):
            if status.lower() in STATUS_CLASS:
                low, high = STATUS_CLASS[status.lower()]
                qs = qs.filter(status__gte=low, status__lt=high)
            elif status.isdigit():
                qs = qs.filter(status=int(status))
            else:
                raise ParamError('Please send "status" as a number such as 404, or as 2xx, 3xx, 4xx or 5xx.')
        if route := _text(request, 'route'):
            qs = qs.filter(route__icontains=route)
        if method := _text(request, 'method'):
            qs = qs.filter(method=method.upper())
        if user := _text(request, 'user'):
            qs = qs.filter(user__email__icontains=user)
        return qs

    def serialize(self, row):
        return {
            'id': row.id, 'created_at': row.created_at, 'request_id': row.request_id, 'method': row.method,
            'route': row.route, 'status': row.status, 'duration_ms': row.duration_ms, 'role': row.role,
            'ip_address': row.ip_address,
        }

    def csv_row(self, row):
        return [
            row.id, row.created_at.isoformat(), row.request_id, row.method, row.route, row.status, row.duration_ms,
            row.role, row.ip_address or '',
        ]


class JobStream(Stream):
    name = 'jobs'
    model = JobLog
    search_columns = ('subject', 'detail')
    csv_header = ['ID', 'Time', 'Kind', 'Subject', 'Detail', 'Reference']

    def filter(self, qs, request):
        qs = super().filter(qs, request)
        if kind := _text(request, 'kind'):
            qs = qs.filter(kind=kind)
        return qs

    def serialize(self, row):
        return {
            'id': row.id, 'created_at': row.created_at, 'kind': row.kind, 'subject': row.subject,
            'detail': row.detail, 'request_id': row.request_id,
        }

    def csv_row(self, row):
        return [row.id, row.created_at.isoformat(), row.kind, row.subject, row.detail, row.request_id]


STREAMS = {s.name: s for s in (AuditStream(), SecurityStream(), RequestStream(), JobStream())}
