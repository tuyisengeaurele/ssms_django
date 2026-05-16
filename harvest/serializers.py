from decimal import Decimal
from rest_framework import serializers
from .models import HarvestRecord


class HarvestRecordSerializer(serializers.ModelSerializer):
    farm_name = serializers.SerializerMethodField()
    farm_id   = serializers.SerializerMethodField()

    class Meta:
        model  = HarvestRecord
        fields = [
            'id', 'batch_id', 'cocoon_weight_kg', 'silk_yield_g',
            'quality_grade', 'notes', 'harvested_at', 'created_at',
            'farm_name', 'farm_id',
        ]
        read_only_fields = ['id', 'batch_id', 'harvested_at', 'created_at', 'farm_name', 'farm_id']

    def get_farm_name(self, obj):
        try:
            return obj.batch.farm.name
        except Exception:
            return None

    def get_farm_id(self, obj):
        try:
            return obj.batch.farm_id
        except Exception:
            return None


class HarvestRecordCreateSerializer(serializers.Serializer):
    batch_id         = serializers.CharField()
    cocoon_weight_kg = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal('0.01'))
    silk_yield_g     = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal('0'), required=False, allow_null=True)
    quality_grade    = serializers.ChoiceField(choices=['A', 'B', 'C'])
    notes            = serializers.CharField(required=False, allow_blank=True, allow_null=True)
