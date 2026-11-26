from django.conf import settings
from django.db import models


class ContactMessage(models.Model):
    name       = models.CharField(max_length=120)
    email      = models.EmailField()
    subject    = models.CharField(max_length=200)
    message    = models.TextField()
    # The language the message is written in (contacts/language.py), which the emails to its sender are written in. Empty on
    # a message that arrived before this was kept: it is worked out from the words when it is needed.
    language   = models.CharField(max_length=2, null=True, blank=True)
    is_read    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    # The admin who sent an answer, and when. Marked by hand, because the reply goes out from their own mail app.
    replied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='answered_messages',
    )
    replied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'contact_messages'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} — {self.subject}'


class ContactReply(models.Model):
    """An answer sent to the person who wrote. The app sends one for a message. They are kept apart from the message so that
    later answers can be added without moving what is stored."""

    message = models.ForeignKey(ContactMessage, on_delete=models.CASCADE, related_name='replies')
    body    = models.TextField()
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='contact_replies',
    )
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'contact_replies'
        ordering = ['sent_at', 'id']

