from rest_framework import serializers

from .models import Batch, BatchStage, MortalityRecord, QuantityUnit

MAX_QUANTITY = 10_000_000


class BatchFarmSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    location = serializers.CharField()


def room_brief(obj):
    """The room a batch is in, or None. Querysets select it with the batch, so this costs no query."""
    room = obj.room
    return {'id': room.pk, 'name': room.name} if room is not None else None


class BatchListSerializer(serializers.ModelSerializer):
    counts = serializers.SerializerMethodField()
    room = serializers.SerializerMethodField()

    def get_room(self, obj):
        return room_brief(obj)

    class Meta:
        model = Batch
        fields = [
            'id', 'farm_id', 'stage', 'start_date', 'expected_harvest_date',
            'notes', 'breed', 'quantity', 'quantity_unit', 'room', 'is_active', 'created_at', 'updated_at', 'counts',
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
    mortality_total = serializers.SerializerMethodField()
    room = serializers.SerializerMethodField()
    room_stays = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = [
            'id', 'farm_id', 'stage', 'start_date', 'expected_harvest_date',
            'notes', 'breed', 'quantity', 'quantity_unit', 'room', 'room_stays', 'is_active', 'created_at', 'updated_at',
            'farm', 'disease_detections', 'sensor_readings', 'alert_logs', 'mortality_total',
        ]

    def get_room(self, obj):
        return room_brief(obj)

    def get_room_stays(self, obj):
        # Where the batch has been, newest first. The open stay has no end.
        stays = obj.room_stays.select_related('room').order_by('-started_at')
        return [
            {'room_id': s.room_id, 'room_name': s.room.name, 'started_at': s.started_at, 'ended_at': s.ended_at}
            for s in stays
        ]

    def get_mortality_total(self, obj):
        from django.db.models import Sum
        return obj.mortality_records.filter(is_active=True).aggregate(total=Sum('count'))['total'] or 0

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
    breed = serializers.CharField(max_length=100, required=False, allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, max_value=MAX_QUANTITY, required=False, allow_null=True)
    quantity_unit = serializers.ChoiceField(choices=QuantityUnit.choices, required=False)
    room_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Batch
        fields = ['farm_id', 'expected_harvest_date', 'notes', 'breed', 'quantity', 'quantity_unit', 'room_id']


class BatchUpdateSerializer(serializers.Serializer):
    """What a farmer can correct after a batch is made. The stage and the farm are not here on purpose."""
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)
    breed = serializers.CharField(max_length=100, required=False, allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, max_value=MAX_QUANTITY, required=False, allow_null=True)
    quantity_unit = serializers.ChoiceField(choices=QuantityUnit.choices, required=False)


class MortalityRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = MortalityRecord
        fields = ['id', 'count', 'note', 'recorded_on', 'created_at']
        read_only_fields = fields


class MortalityCreateSerializer(serializers.Serializer):
    count = serializers.IntegerField(min_value=1, max_value=MAX_QUANTITY)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)
    recorded_on = serializers.DateField(required=False)


class BatchUpdateStageSerializer(serializers.Serializer):
    stage = serializers.ChoiceField(choices=BatchStage.choices)


class BatchSupervisorSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the supervisor dashboard active-batches table."""
    farm = BatchFarmSerializer(read_only=True)
    detection_count = serializers.SerializerMethodField()
    open_alerts = serializers.SerializerMethodField()
    latest_reading = serializers.SerializerMethodField()
    room = serializers.SerializerMethodField()

    def get_room(self, obj):
        return room_brief(obj)

    class Meta:
        model = Batch
        fields = [
            'id', 'farm_id', 'stage', 'start_date',
            'expected_harvest_date', 'is_active', 'created_at',
            'farm', 'room', 'detection_count', 'open_alerts', 'latest_reading',
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
