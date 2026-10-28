from rest_framework import serializers

from locations import registry

from .models import Farm


class OwnerSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    email = serializers.EmailField()


class FarmSerializer(serializers.ModelSerializer):
    owner = OwnerSerializer(read_only=True)
    counts = serializers.SerializerMethodField()
    province = serializers.SerializerMethodField()
    district = serializers.SerializerMethodField()
    sector = serializers.SerializerMethodField()
    cell = serializers.SerializerMethodField()
    village = serializers.SerializerMethodField()

    class Meta:
        model = Farm
        fields = [
            'id', 'name', 'location', 'street', 'province', 'district', 'sector', 'cell', 'village',
            'latitude', 'longitude', 'owner_id', 'is_active', 'created_at', 'updated_at', 'owner', 'counts',
        ]
        read_only_fields = fields

    def _part(self, obj, level):
        """One level of the farm's place as {code, name}, named from the official list, or None on a farm from before places."""
        if not obj.village_code:
            return None
        return (registry.chain(obj.village_code) or {}).get(level)

    def get_province(self, obj):
        return self._part(obj, 'province')

    def get_district(self, obj):
        return self._part(obj, 'district')

    def get_sector(self, obj):
        return self._part(obj, 'sector')

    def get_cell(self, obj):
        return self._part(obj, 'cell')

    def get_village(self, obj):
        return self._part(obj, 'village')

    def get_counts(self, obj):
        # Use prefetched active_batches list when available (list/detail queries)
        if hasattr(obj, 'active_batches'):
            return {'batches': len(obj.active_batches)}
        return {'batches': obj.batches.filter(is_active=True).count()}


class FarmDetailSerializer(FarmSerializer):
    batches = serializers.SerializerMethodField()

    class Meta(FarmSerializer.Meta):
        fields = FarmSerializer.Meta.fields + ['batches']

    def get_batches(self, obj):
        from batches.serializers import BatchListSerializer
        # Re-use the prefetched active_batches when available
        if hasattr(obj, 'active_batches'):
            batches = sorted(obj.active_batches, key=lambda b: b.created_at, reverse=True)
            return BatchListSerializer(batches, many=True).data
        qs = obj.batches.filter(is_active=True).order_by('-created_at')
        return BatchListSerializer(qs, many=True).data


PLACE_LEVELS = ['province', 'district', 'sector', 'cell', 'village']
TOGETHER = 'Please choose places that belong together.'
BOTH = 'Please send both a latitude and a longitude.'
INVALID_POSITION = 'Please send a valid latitude and a longitude.'
NOT_IN_RWANDA = 'That position is not inside Rwanda.'
NOT_IN_SECTOR = 'That position is not inside the sector you chose.'


def _code_field(level: str) -> serializers.CharField:
    ask = f'Please choose the {level}.'
    return serializers.CharField(
        max_length=9, error_messages={'required': ask, 'blank': ask, 'null': ask, 'max_length': TOGETHER},
    )


class _PlaceMixin:
    """The five choices and the street, checked together and turned into the one line a farm shows."""

    def _place(self, attrs: dict) -> dict:
        found = registry.check_address(**{level: attrs[f'{level}_code'] for level in PLACE_LEVELS})
        if found is None:
            raise serializers.ValidationError({'village_code': [TOGETHER]})
        street = attrs.get('street', '').strip()
        attrs['street'] = street
        attrs['location'] = registry.describe(found, street)
        return attrs


# DRF checks that a number is a number before this code sees it, so it needs the project's kind words too.
POSITION_FIELD_ERRORS = {
    'latitude': {'error_messages': {'invalid': INVALID_POSITION}},
    'longitude': {'error_messages': {'invalid': INVALID_POSITION}},
}


class _PositionMixin:
    """The exact spot of a farm, checked against the place chosen for it."""

    def _position(self, attrs: dict, sector_code: str) -> None:
        """Both numbers or neither. Inside Rwanda, and inside the chosen sector when there is one. Rounded to a metre."""
        lat, lng = attrs.get('latitude'), attrs.get('longitude')
        if lat is None and lng is None:
            return
        if lat is None or lng is None:
            raise serializers.ValidationError({'latitude': [BOTH]})
        try:
            found = registry.locate(lat, lng)
        except ValueError:
            raise serializers.ValidationError({'latitude': [INVALID_POSITION]}) from None
        if found is None:
            raise serializers.ValidationError({'latitude': [NOT_IN_RWANDA]})
        if sector_code and found['sector']['code'] != sector_code:
            raise serializers.ValidationError({'latitude': [NOT_IN_SECTOR]})
        attrs['latitude'], attrs['longitude'] = round(lat, 5), round(lng, 5)


class FarmCreateSerializer(_PositionMixin, _PlaceMixin, serializers.ModelSerializer):
    province_code = _code_field('province')
    district_code = _code_field('district')
    sector_code = _code_field('sector')
    cell_code = _code_field('cell')
    village_code = _code_field('village')

    class Meta:
        model = Farm
        fields = ['name', 'province_code', 'district_code', 'sector_code', 'cell_code', 'village_code', 'street', 'latitude', 'longitude']
        extra_kwargs = POSITION_FIELD_ERRORS

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError('Please enter a name for the farm.')
        return value.strip()

    def validate(self, attrs):
        attrs = self._place(attrs)
        self._position(attrs, attrs['sector_code'])
        return attrs


class FarmUpdateSerializer(_PositionMixin, _PlaceMixin, serializers.ModelSerializer):
    """The name, the place, the street or the exact position. The place is all five choices together or none of them."""

    province_code = _code_field('province')
    district_code = _code_field('district')
    sector_code = _code_field('sector')
    cell_code = _code_field('cell')
    village_code = _code_field('village')

    class Meta:
        model = Farm
        fields = ['name', 'province_code', 'district_code', 'sector_code', 'cell_code', 'village_code', 'street', 'latitude', 'longitude']
        extra_kwargs = {'name': {'required': False}, **POSITION_FIELD_ERRORS}

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError('Please enter a name for the farm.')
        return value.strip()

    def validate(self, attrs):
        codes = {f'{level}_code' for level in PLACE_LEVELS}
        if codes & attrs.keys():
            missing = {key: [f'Please choose the {key[:-5]}.'] for key in sorted(codes - attrs.keys())}
            if missing:
                raise serializers.ValidationError(missing)
            attrs = self._place(attrs)
            self._position(attrs, attrs['sector_code'])
            # A position belongs to the sector it is in. Moving the farm to another sector leaves the old one behind.
            if 'latitude' not in attrs and attrs['sector_code'] != self.instance.sector_code:
                attrs['latitude'] = attrs['longitude'] = None
            return attrs
        self._position(attrs, self.instance.sector_code)
        if 'street' in attrs:
            # Only the street changed, so the line is rebuilt from the place the farm already has.
            found = registry.chain(self.instance.village_code) if self.instance.village_code else None
            if found is None:
                raise serializers.ValidationError({'street': ['Please choose where the farm is first.']})
            attrs['street'] = attrs['street'].strip()
            attrs['location'] = registry.describe(found, attrs['street'])
        return attrs
