from django.db import models
from django.conf import settings


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
    created_at  = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user_email} {self.action} {self.resource} {self.resource_id}'
