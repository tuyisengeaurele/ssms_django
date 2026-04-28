from rest_framework import serializers
from .models import AlertLog


class AlertLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertLog
        fields = ['id', 'batch_id', 'type', 'message', 'is_read', 'created_at']
        read_only_fields = fields
