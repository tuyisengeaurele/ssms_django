"""The one password policy. Registration, password change and password reset all use it."""
import re

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError


class ComplexityValidator:
    """A password needs an uppercase letter, a lowercase letter and a number."""

    def validate(self, password, user=None):
        problems = []
        if not re.search(r'[A-Z]', password):
            problems.append(DjangoValidationError('Your password needs at least one uppercase letter.', code='password_no_upper'))
        if not re.search(r'[a-z]', password):
            problems.append(DjangoValidationError('Your password needs at least one lowercase letter.', code='password_no_lower'))
        if not re.search(r'\d', password):
            problems.append(DjangoValidationError('Your password needs at least one number.', code='password_no_digit'))
        if problems:
            raise DjangoValidationError(problems)

    def get_help_text(self):
        return 'Your password needs an uppercase letter, a lowercase letter and a number.'


# Django's own wording is cold, so these codes get kinder sentences.
FRIENDLY = {
    'password_too_short': 'Your password needs at least 8 characters.',
    'password_too_common': 'That password is too common. Please choose one that is harder to guess.',
    'password_too_similar': 'Your password is too close to your name or email. Please choose something different.',
}


def validate_new_password(password: str, user=None) -> None:
    """Raise a DRF ValidationError, in plain words, when the password breaks any rule."""
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        messages = []
        for error in exc.error_list:
            text = FRIENDLY.get(error.code) or ' '.join(error.messages)
            if text not in messages:
                messages.append(text)
        raise ValidationError(messages) from exc
