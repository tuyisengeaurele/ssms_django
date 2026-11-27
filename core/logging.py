"""Log lines as JSON, one object per line, with the reference of the request on every record.

A host's log viewer can then search by reference: a person quotes the reference they saw, and everything that happened
during that request is one search away. Sentry gets the same reference as a tag.
"""
import json
import logging
from datetime import datetime, timezone
from urllib.parse import urlsplit

from .request_id import current_request_id


class RequestIdFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, 'request_id'):
            record.request_id = current_request_id()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record):
        body = {
            'time': datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec='milliseconds'),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'request_id': getattr(record, 'request_id', '') or current_request_id(),
        }
        if record.exc_info:
            body['exception'] = self.formatException(record.exc_info)
        return json.dumps(body, ensure_ascii=False, default=str)


# Routes whose reports drop everything that could hold somebody's words, not only what they sent.
PRIVATE_ROUTES = ('/api/messages',)


def _about_private_words(event) -> bool:
    url = (event.get('request') or {}).get('url') or ''
    # The route's name is there however Django is run. The address is only there on the live server.
    return any(str(name).startswith(PRIVATE_ROUTES) for name in (urlsplit(url).path, event.get('transaction') or ''))


def _forget_the_local_values(event) -> None:
    holders = [event]
    for part in ('exception', 'threads'):
        holders += (event.get(part) or {}).get('values') or []
    for holder in holders:
        for frame in (holder.get('stacktrace') or {}).get('frames') or []:
            frame.pop('vars', None)


def sentry_before_send(event, hint):
    """What leaves for the error reporter: the request's reference added, and what people typed taken out.

    The reporter sends a request's contents even with personal data switched off, so they are removed from every report.
    For routes that carry private words, the program's local values and the trail of what happened go too."""
    request = event.get('request')
    if isinstance(request, dict):
        request.pop('data', None)
    if _about_private_words(event):
        _forget_the_local_values(event)
        event.pop('breadcrumbs', None)

    reference = current_request_id()
    if reference:
        tags = event.setdefault('tags', {})
        if isinstance(tags, dict):
            tags['request_id'] = reference
        else:
            tags.append(['request_id', reference])
    return event


def sentry_options() -> dict:
    """The settings that decide what the reporter may carry. Errors and timing records go through the same filter."""
    return {'send_default_pii': False, 'before_send': sentry_before_send, 'before_send_transaction': sentry_before_send}


def install_record_factory():
    """Every record carries the reference, including ones a handler's filter never sees."""
    previous = logging.getLogRecordFactory()

    def factory(*args, **kwargs):
        record = previous(*args, **kwargs)
        if not hasattr(record, 'request_id'):
            record.request_id = current_request_id()
        return record

    logging.setLogRecordFactory(factory)
