from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = 'CREATE', 'Create'
        UPDATE = 'UPDATE', 'Update'
        DELETE = 'DELETE', 'Delete'
        LOGIN  = 'LOGIN',  'Login'
        LOGOUT = 'LOGOUT', 'Logout'
        OTHER  = 'OTHER',  'Other'

    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='audit_logs',
    )
    user_email  = models.EmailField(blank=True)
    user_name   = models.CharField(max_length=100, blank=True)
    action      = models.CharField(max_length=10, choices=Action.choices)
    resource    = models.CharField(max_length=100)
    resource_id = models.CharField(max_length=100, blank=True)
    detail      = models.TextField(blank=True)
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    # The reference of the request, to find the rest of what happened in the other logs.
    request_id  = models.CharField(max_length=64, blank=True, db_index=True)
    # {field: {'from': ..., 'to': ...}} for the fields the change touched. Secrets are never in it.
    changes     = models.JSONField(default=dict, blank=True)
    device_label = models.CharField(max_length=80, blank=True)
    # Set when an admin changed data that somebody else owns.
    on_behalf_of_email = models.EmailField(blank=True)
    outcome     = models.CharField(max_length=10, default='success')
    created_at  = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user_email} {self.action} {self.resource} {self.resource_id}'
