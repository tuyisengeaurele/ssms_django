import re

from rest_framework import serializers

from core.language import LANGS

CONTROL_CHARACTERS = re.compile(r'[\x00-\x1f\x7f]')
# What a reply may not hold: every control character except the tab and the line break.
UNSENDABLE = re.compile(r'[\x00-\x08\x0b-\x1f\x7f]')
MAX_REPLY = 5000


def _one_line(value: str) -> str:
    # A line break in a name or address could add headers to an email sent with it.
    if CONTROL_CHARACTERS.search(value):
        raise serializers.ValidationError('Please use plain text on a single line.')
    return value.strip()


class ContactSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    email = serializers.EmailField(max_length=254)
    message = serializers.CharField(min_length=10, max_length=5000)

    def validate_name(self, value):
        return _one_line(value)

    def validate_email(self, value):
        return _one_line(value)


class ContactReplySerializer(serializers.Serializer):
    """An admin's answer to a message. Who receives it is never part of the request: it is the address on the message."""

    body = serializers.CharField(trim_whitespace=False, allow_blank=True)
    language = serializers.ChoiceField(choices=LANGS, required=False)

    def validate_body(self, value):
        # The field would turn a number into text by itself.
        if not isinstance(self.initial_data.get('body'), str):
            raise serializers.ValidationError('Write the reply as text.')
        text = value.replace('\r\n', '\n').replace('\r', '\n')
        if UNSENDABLE.search(text):
            raise serializers.ValidationError('The reply holds a character that cannot be sent.')
        text = text.strip()
        if not text:
            raise serializers.ValidationError('Write a reply first.')
        if len(text) > MAX_REPLY:
            raise serializers.ValidationError(f'A reply can hold {MAX_REPLY} characters at most.')
        return text

