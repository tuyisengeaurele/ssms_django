"""How a person wants to be reached, and the rules for changing it.

`preferences_for(user)` is what every sender asks. It never writes: a person who never opened the settings has no row and
gets DEFAULTS.
"""
from datetime import datetime

from rest_framework import serializers

from .models import NotificationPreference

CLOCK = '%H:%M'

DEFAULTS = {
    'in_app': True, 'email': True, 'sms': False, 'whatsapp': False, 'quiet_start': None, 'quiet_end': None,
}


def _clock(value):
    return value.strftime(CLOCK) if value is not None else None


def preferences_for(user) -> dict:
    """The person's choices as a new dict, with times as 'HH:MM' text."""
    row = NotificationPreference.objects.filter(user=user).first()
    if row is None:
        return dict(DEFAULTS)
    return {
        'in_app': row.in_app, 'email': row.email, 'sms': row.sms, 'whatsapp': row.whatsapp,
        'quiet_start': _clock(row.quiet_start), 'quiet_end': _clock(row.quiet_end),
    }


def save_preferences(user, changes: dict) -> dict:
    """Write the changed choices (already checked) and give back the new state."""
    NotificationPreference.objects.update_or_create(user=user, defaults=changes)
    return preferences_for(user)


class NotificationPreferencesSerializer(serializers.Serializer):
    """A partial update. The state the person has now is passed as context['current'], so one end of the quiet hours can change."""

    in_app = serializers.BooleanField(required=False)
    email = serializers.BooleanField(required=False)
    sms = serializers.BooleanField(required=False)
    whatsapp = serializers.BooleanField(required=False)
    quiet_start = serializers.TimeField(required=False, allow_null=True, format=CLOCK, input_formats=[CLOCK])
    quiet_end = serializers.TimeField(required=False, allow_null=True, format=CLOCK, input_formats=[CLOCK])

    def validate_in_app(self, value):
        if not value:
            raise serializers.ValidationError('Messages in the app cannot be turned off.')
        return value

    def validate(self, attrs):
        current = self.context['current']
        start = attrs['quiet_start'] if 'quiet_start' in attrs else _parse(current['quiet_start'])
        end = attrs['quiet_end'] if 'quiet_end' in attrs else _parse(current['quiet_end'])
        if (start is None) != (end is None):
            raise serializers.ValidationError({'quiet_hours': 'Set both times, or neither.'})
        if start is not None and start == end:
            raise serializers.ValidationError({'quiet_hours': 'Choose two different times.'})
        return attrs


def _parse(text):
    return datetime.strptime(text, CLOCK).time() if text is not None else None
