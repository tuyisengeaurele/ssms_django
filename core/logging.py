"""Log lines as JSON, one object per line, with the reference of the request on every record.

A host's log viewer can then search by reference: a person quotes the reference they saw, and everything that happened
during that request is one search away. Sentry gets the same reference as a tag.
"""
import json
import logging
from datetime import datetime, timezone

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


def sentry_before_send(event, hint):
    """Tag the error report with the reference of the request that caused it."""
    reference = current_request_id()
    if reference:
        tags = event.setdefault('tags', {})
        if isinstance(tags, dict):
            tags['request_id'] = reference
        else:
            tags.append(['request_id', reference])
    return event


def install_record_factory():
    """Every record carries the reference, including ones a handler's filter never sees."""
    previous = logging.getLogRecordFactory()

    def factory(*args, **kwargs):
        record = previous(*args, **kwargs)
        if not hasattr(record, 'request_id'):
            record.request_id = current_request_id()
        return record

    logging.setLogRecordFactory(factory)
