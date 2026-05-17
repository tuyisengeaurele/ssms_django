from rest_framework import serializers
from .models import Cooperative


class CooperativeSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    farm_count = serializers.SerializerMethodField()

    class Meta:
        model = Cooperative
        fields = [
            'id', 'name', 'description', 'location',
            'is_active', 'created_at', 'updated_at',
            'member_count', 'farm_count',
        ]
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at', 'member_count', 'farm_count']

    def get_member_count(self, obj):
        return obj.members.filter(is_active=True).count()

    def get_farm_count(self, obj):
        from farms.models import Farm
        return Farm.objects.filter(owner__cooperative=obj, owner__role='FARMER', is_active=True).count()


class CooperativeDetailSerializer(CooperativeSerializer):
    members = serializers.SerializerMethodField()
    farms = serializers.SerializerMethodField()

    class Meta(CooperativeSerializer.Meta):
        fields = CooperativeSerializer.Meta.fields + ['members', 'farms']

    def get_members(self, obj):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        users = User.objects.filter(cooperative=obj, is_active=True).order_by('role', 'name')
        return [
            {
                'id': u.id,
                'name': u.name,
                'email': u.email,
                'role': u.role,
                'created_at': u.created_at.isoformat(),
            }
            for u in users
        ]

    def get_farms(self, obj):
        from farms.models import Farm
        farms = Farm.objects.filter(
            owner__cooperative=obj,
            owner__role='FARMER',
            is_active=True,
        ).select_related('owner').order_by('name')
        return [
            {
                'id': f.id,
                'name': f.name,
                'location': f.location,
                'owner_id': f.owner_id,
                'owner_name': f.owner.name,
            }
            for f in farms
        ]


class CooperativeWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cooperative
        fields = ['name', 'description', 'location']

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError('Cooperative name is required.')
        return value.strip()
