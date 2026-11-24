"""
Management command: anonymise_accounts
Removes what says who the person was from every account whose closure was asked for more than ACCOUNT_DELETION_GRACE_DAYS ago
and was not taken back.

    python manage.py anonymise_accounts
    python manage.py anonymise_accounts --dry-run

Run it every night, after `prune_logs`. Running it twice changes nothing more. One account that fails does not stop the others:
the failure is logged, the rest are done, and the command ends with an error so the scheduler tells the owner.
"""
import logging

from django.core.management.base import CommandError

from logs.jobs import LoggedCommand
from users import closure

logger = logging.getLogger(__name__)


class Command(LoggedCommand):
    help = 'Anonymise the accounts whose closure was asked for and whose grace days are over.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Say how many accounts would be anonymised and change nothing.')

    def handle(self, *args, **options):
        due = list(closure.due_accounts())
        if options['dry_run']:
            self.stdout.write(f'Would anonymise {len(due)} accounts.')
            return
        done, failed = 0, []
        for account in due:
            try:
                closure.anonymise(account)
                done += 1
            except Exception:
                logger.exception('Could not anonymise account %s', account.pk)
                failed.append(account.pk)
        self.stdout.write(f'Anonymised {done} accounts.')
        if failed:
            raise CommandError(f'{len(failed)} accounts could not be anonymised: {", ".join(failed)}')
