from rest_framework import serializers

from contacts.serializers import UNSENDABLE

from .access import is_farmer

LONGEST = 2000


class SendSerializer(serializers.Serializer):
    """A message, and where it goes. The caller is passed in context['user']."""

    body = serializers.CharField(trim_whitespace=False, allow_blank=True)
    # Made by the page for each message. Sending the same one again saves nothing twice.
    client_id = serializers.RegexField(r'^[A-Za-z0-9-]{8,36}$')
    conversation_id = serializers.CharField(required=False, max_length=36)
    farmer_id = serializers.CharField(required=False, max_length=36)

    def validate_body(self, value):
        # The field would turn a number into text by itself.
        if not isinstance(self.initial_data.get('body'), str):
            raise serializers.ValidationError('Write the message as text.')
        text = value.replace('\r\n', '\n').replace('\r', '\n')
        if UNSENDABLE.search(text):
            raise serializers.ValidationError('The message holds a character that cannot be sent.')
        text = text.strip()
        if not text:
            raise serializers.ValidationError('Write a message first.', code='message_empty')
        if len(text) > LONGEST:
            raise serializers.ValidationError(f'A message can hold {LONGEST} characters at most.', code='message_too_long')
        return text

    def validate(self, attrs):
        if is_farmer(self.context['user']):
            if 'farmer_id' in attrs:
                raise serializers.ValidationError({'farmer_id': ['Leave the farmer out to write to your cooperative.']})
        elif ('conversation_id' in attrs) == ('farmer_id' in attrs):
            raise serializers.ValidationError({'conversation_id': ['Choose one conversation or one farmer.']})
        return attrs


class ReadSerializer(serializers.Serializer):
    conversation_id = serializers.CharField(max_length=36)
    message_id = serializers.CharField(max_length=36)
