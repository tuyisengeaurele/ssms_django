"""Removes messages older than the retention time, then the conversations that have nothing left in them.

Run every night (.github/workflows/jobs-nightly.yml). The privacy page says how long a message is kept.
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from messaging.models import Conversation, Message


class Command(BaseCommand):
    help = 'Remove messages older than MESSAGE_RETENTION_DAYS, and conversations left empty.'

    def handle(self, *args, **options):
        before = timezone.now() - timedelta(days=settings.MESSAGE_RETENTION_DAYS)
        with transaction.atomic():
            messages, _ = Message.objects.filter(created_at__lt=before).delete()
            # A conversation is only made together with its first message, so an empty one has had all of its removed.
            conversations, _ = Conversation.objects.filter(messages__isnull=True).delete()
        self.stdout.write(
            f'Removed {messages} message{"" if messages == 1 else "s"} and '
            f'{conversations} empty conversation{"" if conversations == 1 else "s"}.'
        )
