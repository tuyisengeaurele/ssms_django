from rest_framework import serializers

from .models import Cooperative


def with_counts(coops):
    """Members and farms of every cooperative of a list, counted in the one query. See CooperativeSerializer."""
    from django.contrib.auth import get_user_model
    from django.db.models import Count, IntegerField, OuterRef, Subquery
    from django.db.models.functions import Coalesce

    from farms.models import Farm

    people = get_user_model().objects.filter(cooperative=OuterRef('pk'), is_active=True).order_by().values('cooperative').annotate(n=Count('pk')).values('n')
    farms = (
        Farm.objects.filter(owner__cooperative=OuterRef('pk'), owner__role='FARMER', is_active=True)
        .order_by().values('owner__cooperative').annotate(n=Count('pk')).values('n')
    )
    return coops.annotate(
        member_total=Coalesce(Subquery(people, output_field=IntegerField()), 0),
        farm_total=Coalesce(Subquery(farms, output_field=IntegerField()), 0),
    )


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
        # A list counts both in its own query (with_counts below). One cooperative on its own asks here.
        counted = getattr(obj, 'member_total', None)
        return counted if counted is not None else obj.members.filter(is_active=True).count()

    def get_farm_count(self, obj):
        counted = getattr(obj, 'farm_total', None)
        if counted is not None:
            return counted
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
        from users.phone_visibility import person_row, visible_phone_ids
        users = list(User.objects.filter(cooperative=obj, is_active=True).order_by('role', 'name'))
        viewer = self.context['request'].user
        visible = visible_phone_ids(viewer, [u.pk for u in users])
        return [person_row(viewer, u, visible, role=u.role, created_at=u.created_at.isoformat()) for u in users]

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
            raise serializers.ValidationError('Please enter a name for the cooperative.')
        return value.strip()
