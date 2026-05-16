from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AuditLog
        fields = ['id', 'user_email', 'action', 'resource', 'resource_id', 'detail', 'ip_address', 'created_at']
