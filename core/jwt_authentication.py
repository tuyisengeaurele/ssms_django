from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from users.models import UserSession


class ActiveUserJWTAuthentication(JWTAuthentication):
    """
    Extends the default JWTAuthentication in two ways.

    A token belonging to a deactivated user (is_active=False) is refused. Without that guard a user could be
    deactivated by an admin yet keep authenticating with their existing token until it expires.

    A token whose sign in has been ended (signed out, revoked, expired) is refused at once, not when the token
    runs out. Tokens made before sessions existed carry no session id and are accepted until they expire.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not user.is_active:
            raise AuthenticationFailed(
                'This account has been deleted. Contact the SSMS team.',
                code='user_inactive',
            )
        return user

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        _, token = result
        request.session_id = token.payload.get('sid')
        if request.session_id:
            # One indexed lookup on the primary key.
            state = UserSession.objects.filter(pk=request.session_id).values_list('revoked_at', 'expires_at').first()
            if state is None or state[0] is not None or timezone.now() >= state[1]:
                raise AuthenticationFailed('Your session has ended. Please sign in again.', code='session_revoked')
        return result
