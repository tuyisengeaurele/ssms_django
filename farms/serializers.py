from rest_framework import serializers
from .models import Farm


class OwnerSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    email = serializers.EmailField()


class FarmSerializer(serializers.ModelSerializer):
    owner = OwnerSerializer(read_only=True)
    _count = serializers.SerializerMethodField()

    class Meta:
        model = Farm
        fields = [
            'id', 'name', 'location', 'owner_id', 'is_active',
            'created_at', 'updated_at', 'owner', '_count',
        ]
        read_only_fields = ['id', 'owner_id', 'is_active', 'created_at', 'updated_at', 'owner', '_count']

    def get__count(self, obj):
        # Use the annotated value when present (list/detail queries) — avoids N+1
        if hasattr(obj, 'active_batch_count'):
            return {'batches': obj.active_batch_count}
        return {'batches': obj.batches.filter(is_active=True).count()}


class FarmDetailSerializer(FarmSerializer):
    batches = serializers.SerializerMethodField()

    class Meta(FarmSerializer.Meta):
        fields = FarmSerializer.Meta.fields + ['batches']

    def get_batches(self, obj):
        from batches.serializers import BatchListSerializer
        qs = obj.batches.filter(is_active=True).order_by('-created_at')
        return BatchListSerializer(qs, many=True).data


class FarmCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Farm
        fields = ['name', 'location']

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError('Farm name is required.')
        return value.strip()

    def validate_location(self, value):
        if not value.strip():
            raise serializers.ValidationError('Location is required.')
        return value.strip()


class FarmUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Farm
        fields = ['name', 'location']
        extra_kwargs = {
            'name': {'required': False},
            'location': {'required': False},
        }
