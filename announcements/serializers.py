from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers

from .models import TEXT_LIMIT, Announcement


class MomentField(serializers.DateTimeField):
    """A date and time that says its own time zone. Without one the server would guess, and a banner would start hours off."""

    default_error_messages = {'no_zone': 'Give a date and time with its time zone.'}

    def to_internal_value(self, value):
        try:
            parsed = parse_datetime(value) if isinstance(value, str) else None
        except ValueError:   # the shape of a date, with a month or an hour that does not exist
            parsed = None
        if parsed is None or timezone.is_naive(parsed):
            self.fail('no_zone')
        return parsed


class BannerText(serializers.CharField):
    """A banner is one line. The length is counted after the spare spaces and line breaks are gone."""

    def to_internal_value(self, data):
        text = ' '.join(super().to_internal_value(data).split())
        if len(text) > TEXT_LIMIT:
            raise serializers.ValidationError(f'This can hold {TEXT_LIMIT} characters at most.')
        return text


class AnnouncementSerializer(serializers.Serializer):
    """One serializer to write and to change. On a change, `instance` is the stored row and any field may be left out."""

    kind = serializers.ChoiceField(choices=Announcement.Kind.CHOICES)
    text_en = BannerText()
    text_fr = BannerText(required=False, allow_blank=True)
    text_rw = BannerText(required=False, allow_blank=True)
    show_public = serializers.BooleanField(required=False)
    show_from = MomentField()
    show_until = MomentField()

    def validate(self, attrs):
        starts = attrs.get('show_from', getattr(self.instance, 'show_from', None))
        ends = attrs.get('show_until', getattr(self.instance, 'show_until', None))
        if ends <= starts:
            raise serializers.ValidationError({'show_until': ['The end must come after the start.']}, code='announcement_times')
        if ends <= timezone.now():
            raise serializers.ValidationError({'show_until': ['Choose an end time that is still to come.']}, code='announcement_past')
        return attrs
