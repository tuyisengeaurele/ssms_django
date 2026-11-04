from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AuditLog
        fields = [
            'id', 'user_name', 'user_email', 'action',
            'resource', 'resource_id', 'detail', 'ip_address', 'created_at',
            'request_id', 'changes', 'device_label', 'on_behalf_of_email', 'outcome',
        ]
