from rest_framework import serializers
from .models import Batch, BatchStage


class BatchFarmSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    location = serializers.CharField()


class BatchListSerializer(serializers.ModelSerializer):
    _count = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = [
            'id', 'farm_id', 'stage', 'start_date', 'expected_harvest_date',
            'notes', 'is_active', 'created_at', 'updated_at', '_count',
        ]

    def get__count(self, obj):
        return {
            'disease_detections': obj.disease_detections.count(),
            'sensor_readings': obj.sensor_readings.count(),
            'alert_logs': obj.alert_logs.count(),
        }


class BatchDetailSerializer(serializers.ModelSerializer):
    farm = BatchFarmSerializer(read_only=True)
    disease_detections = serializers.SerializerMethodField()
    sensor_readings = serializers.SerializerMethodField()
    alert_logs = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = [
            'id', 'farm_id', 'stage', 'start_date', 'expected_harvest_date',
            'notes', 'is_active', 'created_at', 'updated_at',
            'farm', 'disease_detections', 'sensor_readings', 'alert_logs',
        ]

    def get_disease_detections(self, obj):
        from sensors.serializers import DiseaseDetectionSerializer
        qs = obj.disease_detections.order_by('-detected_at')[:10]
        return DiseaseDetectionSerializer(qs, many=True).data

    def get_sensor_readings(self, obj):
        from sensors.serializers import SensorReadingSerializer
        qs = obj.sensor_readings.order_by('-timestamp')[:20]
        return SensorReadingSerializer(qs, many=True).data

    def get_alert_logs(self, obj):
        from alerts.serializers import AlertLogSerializer
        qs = obj.alert_logs.filter(is_read=False).order_by('-created_at')
        return AlertLogSerializer(qs, many=True).data


class BatchCreateSerializer(serializers.ModelSerializer):
    farm_id = serializers.CharField()
    expected_harvest_date = serializers.DateTimeField()
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Batch
        fields = ['farm_id', 'expected_harvest_date', 'notes']


class BatchUpdateStageSerializer(serializers.Serializer):
    stage = serializers.ChoiceField(choices=BatchStage.choices)
