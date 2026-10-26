from django.contrib.auth.tokens import PasswordResetTokenGenerator


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Links that confirm an email address.

    The token covers whether the address is already verified, so a link stops working the moment
    it has been used. It has its own salt, so a password reset token can never confirm an email
    and the other way round.
    """

    key_salt = 'users.tokens.EmailVerificationTokenGenerator'

    def _make_hash_value(self, user, timestamp):
        return f'{super()._make_hash_value(user, timestamp)}{user.is_email_verified}'


email_verification_token = EmailVerificationTokenGenerator()
