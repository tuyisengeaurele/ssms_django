"""Three of the four log streams, and the memory of the system health checks. The fourth, who changed what, is `audit_log.AuditLog`.

* SecurityEvent: sign ins, lockouts, password changes, new devices, ended sessions, refusals and slow downs. Kept 12 months.
* RequestLog: every failed request and a sample of the good ones. Kept 14 days. Never a body, a header or a query.
* JobLog: mail that failed, readings a device sent that were refused, devices that went quiet, and commands that ran.

Every row can carry the reference of the request it came from, so one reference finds the rest.
"""
from django.conf import settings
from django.db import models


class SecurityEvent(models.Model):
    kind = models.CharField(max_length=30, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    user_email = models.EmailField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    request_id = models.CharField(max_length=64, blank=True, db_index=True)
    detail = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.kind} {self.user_email}'


class RequestLog(models.Model):
    request_id = models.CharField(max_length=64, db_index=True)
    method = models.CharField(max_length=10)
    # The route pattern, such as api/lots/<str:token>, never the address that was asked for. Tokens never land here.
    route = models.CharField(max_length=200)
    status = models.PositiveSmallIntegerField(db_index=True)
    duration_ms = models.PositiveIntegerField(default=0)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    role = models.CharField(max_length=20, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    # The support access this request was made under, so every request of a visit can be found. Empty otherwise.
    support_access_id = models.CharField(max_length=36, blank=True, default='', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']


class HealthCheckResult(models.Model):
    """One answer of one service to one check, written every few minutes by `run_health_checks`. Kept 30 days."""
    service = models.CharField(max_length=30)
    status = models.CharField(max_length=10)
    milliseconds = models.PositiveIntegerField(null=True, blank=True)
    # A short word such as timeout or unreachable. Never an address and never a secret.
    reason = models.CharField(max_length=40, blank=True)
    checked_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ['-checked_at', '-id']
        indexes = [models.Index(fields=['service', 'checked_at'], name='health_service_time')]


class JobLog(models.Model):
    kind = models.CharField(max_length=30, db_index=True)
    subject = models.CharField(max_length=200, blank=True)
    detail = models.CharField(max_length=300, blank=True)
    request_id = models.CharField(max_length=64, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at', '-id']
