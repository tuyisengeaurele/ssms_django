from rest_framework import serializers
from .models import AlertLog


class BatchBriefSerializer(serializers.Serializer):
    id = serializers.CharField()
    stage = serializers.CharField()


class AlertLogSerializer(serializers.ModelSerializer):
    farmer_name = serializers.SerializerMethodField()
    batch = serializers.SerializerMethodField()

    class Meta:
        model = AlertLog
        fields = ['id', 'batch_id', 'type', 'message', 'is_read', 'created_at', 'farmer_name', 'batch']
        read_only_fields = fields

    def get_farmer_name(self, obj):
        try:
            return obj.batch.farm.owner.name
        except Exception:
            return None

    def get_batch(self, obj):
        try:
            return {'id': obj.batch.id, 'stage': obj.batch.stage}
        except Exception:
            return None
