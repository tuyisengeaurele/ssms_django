from rest_framework import serializers

from .models import Batch, BatchStage


class BatchFarmSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    location = serializers.CharField()


class BatchListSerializer(serializers.ModelSerializer):
    counts = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = [
            'id', 'farm_id', 'stage', 'start_date', 'expected_harvest_date',
            'notes', 'is_active', 'created_at', 'updated_at', 'counts',
        ]

    def get_counts(self, obj):
        # Querysets built with batches.queries.with_counts carry the totals, which costs no extra query.
        if hasattr(obj, 'detection_total'):
            return {
                'disease_detections': obj.detection_total,
                'sensor_readings': obj.reading_total,
                'alert_logs': obj.alert_total,
            }
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


class BatchSupervisorSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the supervisor dashboard active-batches table."""
    farm = BatchFarmSerializer(read_only=True)
    detection_count = serializers.SerializerMethodField()
    open_alerts = serializers.SerializerMethodField()
    latest_reading = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = [
            'id', 'farm_id', 'stage', 'start_date',
            'expected_harvest_date', 'is_active', 'created_at',
            'farm', 'detection_count', 'open_alerts', 'latest_reading',
        ]

    def get_open_alerts(self, obj):
        # Temperature and humidity problems that are still open. Annotated by the view.
        return getattr(obj, 'open_alerts', 0)

    def get_latest_reading(self, obj):
        # Annotated by the view, so this costs no query. None when the batch has no readings yet.
        at = getattr(obj, 'latest_reading_at', None)
        if at is None:
            return None
        return {'temperature': obj.latest_temperature, 'humidity': obj.latest_humidity, 'timestamp': at}

    def get_detection_count(self, obj):
        # Uses annotated value from view queryset (no extra query)
        return getattr(obj, 'detection_count', 0)
