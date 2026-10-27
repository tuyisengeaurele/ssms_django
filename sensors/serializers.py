import math

from rest_framework import serializers

from .models import DiseaseDetection, SensorReading


class DiseaseDetectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiseaseDetection
        fields = ['id', 'batch_id', 'image_url', 'result', 'confidence', 'detected_at', 'notes']
        read_only_fields = fields


class SensorReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorReading
        fields = ['id', 'batch_id', 'room_id', 'temperature', 'humidity', 'timestamp']
        read_only_fields = ['id', 'timestamp']


class SensorReadingCreateSerializer(serializers.ModelSerializer):
    batch_id = serializers.CharField()
    temperature = serializers.FloatField(min_value=-10, max_value=60)
    humidity = serializers.FloatField(min_value=0, max_value=100)

    class Meta:
        model = SensorReading
        fields = ['batch_id', 'temperature', 'humidity']

    def validate_temperature(self, value):
        if not (-10 <= value <= 60):
            raise serializers.ValidationError('Temperature should be between -10 and 60°C.')
        return value

    def validate_humidity(self, value):
        if not (0 <= value <= 100):
            raise serializers.ValidationError('Humidity should be between 0 and 100%.')
        return value


class DeviceReadingSerializer(serializers.Serializer):
    """What a device sends. The limits are those of common sensors, so a faulty value is refused, not stored."""
    temperature = serializers.FloatField(min_value=-40, max_value=85)
    humidity = serializers.FloatField(min_value=0, max_value=100)

    def _finite(self, value):
        if not math.isfinite(value):
            raise serializers.ValidationError('Please send a real number.')
        return value

    validate_temperature = _finite
    validate_humidity = _finite
