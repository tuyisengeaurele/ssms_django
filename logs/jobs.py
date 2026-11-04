"""Writing to the jobs and devices log: mail that failed, readings that were refused, devices that went quiet, commands."""
import logging

from django.core.management.base import BaseCommand

from core.request_id import current_request_id

from .models import JobLog

logger = logging.getLogger(__name__)


def record_job(kind: str, subject: str = '', detail: str = '') -> None:
    """Write one row. A problem writing it is logged and never reaches the job it describes."""
    try:
        JobLog.objects.create(
            kind=kind, subject=(subject or '')[:200], detail=(detail or '')[:300], request_id=current_request_id(),
        )
    except Exception:
        logger.exception('Could not write the job log entry %s', kind)


class LoggedCommand(BaseCommand):
    """A management command that writes when it starts and when it ends, so a scheduler that stopped running shows up."""

    def execute(self, *args, **options):
        name = self.__module__.rsplit('.', 1)[-1]
        record_job('command_started', name)
        try:
            result = super().execute(*args, **options)
        except Exception as exc:
            record_job('command_failed', name, f'{type(exc).__name__}: {exc}')
            raise
        record_job('command_finished', name)
        return result
