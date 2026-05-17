from rest_framework import serializers
from .models import SensorReading, DiseaseDetection


class DiseaseDetectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiseaseDetection
        fields = ['id', 'batch_id', 'image_url', 'result', 'confidence', 'detected_at', 'notes']
        read_only_fields = fields


class SensorReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SensorReading
        fields = ['id', 'batch_id', 'temperature', 'humidity', 'timestamp']
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
            raise serializers.ValidationError('Temperature out of range (-10 to 60°C).')
        return value

    def validate_humidity(self, value):
        if not (0 <= value <= 100):
            raise serializers.ValidationError('Humidity out of range (0 to 100%).')
        return value
