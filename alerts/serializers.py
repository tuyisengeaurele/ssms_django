from rest_framework import serializers

from .models import AlertLog, StageThreshold


class BatchBriefSerializer(serializers.Serializer):
    id = serializers.CharField()
    stage = serializers.CharField()


class AlertLogSerializer(serializers.ModelSerializer):
    farmer_name = serializers.SerializerMethodField()
    batch = serializers.SerializerMethodField()
    room = serializers.SerializerMethodField()
    batches = serializers.SerializerMethodField()
    acknowledged_by = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = AlertLog
        fields = [
            'id', 'batch_id', 'room_id', 'type', 'message', 'is_read', 'created_at', 'resolved_at',
            'acknowledged_by', 'acknowledged_at', 'comment_count',
            'farmer_name', 'batch', 'room', 'batches',
        ]
        read_only_fields = fields

    def get_acknowledged_by(self, obj):
        user = obj.acknowledged_by
        return {'id': user.pk, 'name': user.name or user.email} if user else None

    def get_comment_count(self, obj):
        """Lists annotate it. A single alert that was not annotated is counted here."""
        counted = getattr(obj, 'comment_count', None)
        return counted if counted is not None else obj.comments.filter(is_active=True).count()

    def get_farmer_name(self, obj):
        try:
            return (obj.batch or obj.room).farm.owner.name
        except Exception:
            return None

    def get_room(self, obj):
        return {'id': obj.room.id, 'name': obj.room.name} if obj.room_id else None

    def get_batches(self, obj):
        """The batches in the room now, so a room alert says who it affects. Views prefetch them as `live_batches`."""
        if not obj.room_id:
            return []
        live = getattr(obj.room, 'live_batches', None)
        if live is None:
            live = obj.room.batches.filter(is_active=True)
        return [{'id': b.id, 'stage': b.stage} for b in live]

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
        fields = ['stage', 'temp_min', 'temp_max', 'hum_min', 'hum_max', 'updated_at', 'updated_by']
        read_only_fields = ['stage', 'updated_at', 'updated_by']

    updated_by = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    def get_updated_by(self, obj):
        user = obj.updated_by
        return {'id': user.pk, 'name': user.name or user.email} if user else None

    def get_updated_at(self, obj):
        # A range nobody has changed still has a save time from when it was made, so it is only reported once someone changed it.
        return obj.updated_at.isoformat() if obj.updated_by_id else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Farmers and supervisors do not know about admins, so only an admin is told who changed a range.
        if not self.context.get('admin'):
            data.pop('updated_by', None)
            data.pop('updated_at', None)
        return data

    def validate(self, data):
        if data['temp_min'] >= data['temp_max']:
            raise serializers.ValidationError({'temp_max': 'Please set the highest temperature above the lowest.'})
        if data['hum_min'] >= data['hum_max']:
            raise serializers.ValidationError({'hum_max': 'Please set the highest humidity above the lowest.'})
        return data
