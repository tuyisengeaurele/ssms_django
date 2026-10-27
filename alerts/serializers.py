from rest_framework import serializers

from .models import AlertLog, StageThreshold


class BatchBriefSerializer(serializers.Serializer):
    id = serializers.CharField()
    stage = serializers.CharField()


class AlertLogSerializer(serializers.ModelSerializer):
    farmer_name = serializers.SerializerMethodField()
    batch = serializers.SerializerMethodField()

    class Meta:
        model = AlertLog
        fields = ['id', 'batch_id', 'type', 'message', 'is_read', 'created_at', 'resolved_at', 'farmer_name', 'batch']
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


class StageThresholdSerializer(serializers.ModelSerializer):
    """One stage's safe range. All four numbers are needed, and a range has to make sense."""

    temp_min = serializers.FloatField(min_value=0, max_value=50)
    temp_max = serializers.FloatField(min_value=0, max_value=50)
    hum_min = serializers.FloatField(min_value=0, max_value=100)
    hum_max = serializers.FloatField(min_value=0, max_value=100)

    class Meta:
        model = StageThreshold
        fields = ['stage', 'temp_min', 'temp_max', 'hum_min', 'hum_max']
        read_only_fields = ['stage']

    def validate(self, data):
        if data['temp_min'] >= data['temp_max']:
            raise serializers.ValidationError({'temp_max': 'The highest temperature must be above the lowest.'})
        if data['hum_min'] >= data['hum_max']:
            raise serializers.ValidationError({'hum_max': 'The highest humidity must be above the lowest.'})
        return data
