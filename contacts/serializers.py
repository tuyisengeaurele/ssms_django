import re

from rest_framework import serializers

CONTROL_CHARACTERS = re.compile(r'[\x00-\x1f\x7f]')


def _one_line(value: str) -> str:
    # A line break in a name, subject or address could add headers to an email sent with it.
    if CONTROL_CHARACTERS.search(value):
        raise serializers.ValidationError('Please use plain text on a single line.')
    return value.strip()


class ContactSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    email = serializers.EmailField(max_length=254)
    subject = serializers.CharField(max_length=200)
    message = serializers.CharField(min_length=10, max_length=5000)

    def validate_name(self, value):
        return _one_line(value)

    def validate_email(self, value):
        return _one_line(value)

    def validate_subject(self, value):
        return _one_line(value)
