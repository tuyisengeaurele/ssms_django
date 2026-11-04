"""
Management command: prune_sessions
Deletes signed in sessions that ended (signed out, revoked or ran out) more than --days ago. Live sessions stay.

    python manage.py prune_sessions --days 30
"""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from logs.jobs import LoggedCommand
from users.models import UserSession


class Command(LoggedCommand):
    help = 'Delete sessions that ended more than N days ago.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=30, help='Keep ended sessions this many days (default: 30).')

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=options['days'])
        deleted, _ = UserSession.objects.filter(Q(revoked_at__lt=cutoff) | Q(expires_at__lt=cutoff)).delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {deleted} ended sessions older than {options["days"]} days.'))
