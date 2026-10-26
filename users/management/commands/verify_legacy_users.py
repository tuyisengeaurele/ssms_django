import re
from datetime import date, datetime, timezone

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        'Mark active accounts created before a date as email verified. '
        'Accounts made before email verification existed cannot sign in until they are.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--before', required=True, help='Only accounts created before this date, YYYY-MM-DD.')
        parser.add_argument('--dry-run', action='store_true', help='List the accounts without changing anything.')

    def handle(self, *args, before, dry_run, **options):
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', before):
            raise CommandError('Please give the date as YYYY-MM-DD, for example 2026-05-16.')
        try:
            day = date.fromisoformat(before)
        except ValueError as exc:
            raise CommandError('Please give the date as YYYY-MM-DD, for example 2026-05-16.') from exc

        cutoff = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        accounts = get_user_model().objects.filter(
            is_active=True, is_email_verified=False, created_at__lt=cutoff,
        ).order_by('created_at')

        emails = list(accounts.values_list('email', flat=True))
        for email in emails:
            self.stdout.write(f'  {email}')

        if dry_run:
            self.stdout.write(f'Would verify {len(emails)} account(s). Nothing was changed.')
            return
        accounts.update(is_email_verified=True)
        self.stdout.write(f'Verified {len(emails)} account(s).')
