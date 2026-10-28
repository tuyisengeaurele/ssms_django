from django.conf import settings
from django.db import models


class ContactMessage(models.Model):
    name       = models.CharField(max_length=120)
    email      = models.EmailField()
    subject    = models.CharField(max_length=200)
    message    = models.TextField()
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
