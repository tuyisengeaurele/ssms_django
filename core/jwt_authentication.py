from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed


class ActiveUserJWTAuthentication(JWTAuthentication):
    """
    Extends the default JWTAuthentication to reject tokens belonging
    to deactivated users (is_active=False).  Without this guard a user
    could be deactivated by an admin yet keep authenticating with their
    existing token until it expires.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not user.is_active:
            raise AuthenticationFailed(
                'This account has been deactivated. Contact your administrator.',
                code='user_inactive',
            )
        return user
