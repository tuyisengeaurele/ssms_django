"""A farmer and the supervisors of their cooperative writing to each other."""
from django.conf import settings
from django.db import models
from django.utils import timezone

from core.ids import new_id


class Conversation(models.Model):
    """One for each farmer in a cooperative. Whether it takes new messages is worked out from where the farmer is now
    (`messaging.access`), never stored, so a move can never leave it saying the wrong thing."""

    id = models.CharField(primary_key=True, max_length=36, default=new_id, editable=False)
    cooperative = models.ForeignKey('cooperatives.Cooperative', on_delete=models.CASCADE, related_name='conversations')
    farmer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations')
    created_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(default=timezone.now)
    # How far each side has read. The cooperative's supervisors share one mark: they answer as a team.
    farmer_read_at = models.DateTimeField(null=True, blank=True)
    staff_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'conversations'
        constraints = [
            models.UniqueConstraint(fields=['cooperative', 'farmer'], name='conversation_one_per_farmer_and_cooperative'),
        ]
        indexes = [models.Index(fields=['cooperative', '-last_message_at'], name='conversation_coop_latest_idx')]

    def __str__(self):
        return f'{self.farmer_id} and {self.cooperative_id}'


class Message(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=new_id, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    # Which side wrote it. Kept on the row, because the writer's role and cooperative can change later.
    from_farmer = models.BooleanField()
    body = models.TextField()
    # Made by the page for each message it sends, so that sending again after a lost answer saves nothing twice.
    client_id = models.CharField(max_length=36)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'messages'
        constraints = [models.UniqueConstraint(fields=['conversation', 'sender', 'client_id'], name='message_sent_once')]
        indexes = [models.Index(fields=['conversation', 'created_at', 'id'], name='message_order_idx')]

    def __str__(self):
        # Never the words: this can end up in a log.
        return f'message {self.pk}'
