"""
Management command: prepare_load_test
Makes throwaway farmers for scripts/load_test.py and writes one access token for each to a file.

    python manage.py prepare_load_test --users 50 --tokens-file load_tokens.json
    python manage.py prepare_load_test --remove

The API limits each person to 300 requests a minute, so 50 people at once need 50 accounts. Each account is a verified
farmer with one farm and two batches, so the pages it reads have data. They have no password, and the tokens last
JWT_ACCESS_MINUTES (15 by default), so make them just before the run. The tokens file is a secret: it opens those
accounts. Delete it after the run, and run --remove to delete the accounts and what they own.

Run it with DATABASE_URL and the live JWT_SECRET set in your own terminal, then close the terminal, as for createsuperuser.
The tokens are signed with JWT_SECRET, and the API refuses a token signed with any other value. Running it twice
does not make the accounts twice.
"""
import json
from datetime import timedelta
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from batches.models import Batch
from farms.models import Farm
from users.models import Role, User

EMAIL_PREFIX = 'loadtest'
EMAIL_DOMAIN = '@example.invalid'
FARM_NAME = 'Load test farm'
MOST_USERS = 200


def load_users():
    return User.objects.filter(email__startswith=EMAIL_PREFIX, email__endswith=EMAIL_DOMAIN)


class Command(BaseCommand):
    help = 'Make throwaway farmers and their access tokens for the load test, or remove them.'

    def add_arguments(self, parser):
        parser.add_argument('--users', type=int, default=50, help=f'How many accounts, 1 to {MOST_USERS}.')
        parser.add_argument('--tokens-file', default='load_tokens.json', help='Where to write the access tokens.')
        parser.add_argument('--remove', action='store_true', help='Delete the throwaway accounts and what they own.')

    def handle(self, *args, **options):
        if options['remove']:
            _, removed = load_users().delete()
            self.stdout.write(f'Removed {removed.get("users.User", 0)} accounts and what they owned.')
            return

        count = options['users']
        if not 1 <= count <= MOST_USERS:
            raise CommandError(f'--users must be from 1 to {MOST_USERS}.')

        tokens = []
        for number in range(1, count + 1):
            user, _ = User.objects.get_or_create(
                email=f'{EMAIL_PREFIX}{number:03d}{EMAIL_DOMAIN}',
                defaults={'name': f'Load test {number:03d}', 'role': Role.FARMER, 'is_email_verified': True},
            )
            farm, _ = Farm.objects.get_or_create(owner=user, name=FARM_NAME, defaults={'location': 'Gatsibo'})
            for _ in range(2 - Batch.objects.filter(farm=farm).count()):
                Batch.objects.create(farm=farm, expected_harvest_date=timezone.now() + timedelta(days=30))
            tokens.append(str(AccessToken.for_user(user)))

        Path(options['tokens_file']).write_text(json.dumps({'tokens': tokens}), encoding='utf-8')
        self.stdout.write(f'Made {count} accounts and wrote their tokens to {options["tokens_file"]}. They run out in minutes. Delete the file after the run.')
