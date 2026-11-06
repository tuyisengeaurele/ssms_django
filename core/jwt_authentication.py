from datetime import timedelta

from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.settings import api_settings

from users.models import Role, UserSession
from users.sessions import IDLE_MESSAGE, idle_limit

# Using the site moves the idle clock, but it is written at most this often, so a busy page costs one write a minute.
TOUCH_EVERY = timedelta(seconds=60)

MFA_MESSAGE = 'Please sign in again and enter the code from your authenticator app.'


class ActiveUserJWTAuthentication(JWTAuthentication):
    """
    Extends the default JWTAuthentication in two ways.

    A token belonging to a deactivated user (is_active=False) is refused. Without that guard a user could be
    deactivated by an admin yet keep authenticating with their existing token until it expires.

    A token whose sign in has been ended (signed out, revoked, expired) is refused at once, not when the token
    runs out. Tokens made before sessions existed carry no session id and are accepted until they expire.

    An admin is held to more: the session must have passed a code from the authenticator app (`mfa_verified_at`), and
    a token with no session id is refused. So no other path can give an admin a working session.
    """

    def get_user(self, validated_token):
        return self._must_be_active(super().get_user(validated_token))

    @staticmethod
    def _must_be_active(user):
        if not user.is_active:
            raise AuthenticationFailed(
                'This account has been deleted. Contact the SSMS team.',
                code='user_inactive',
            )
        return user

    def _session_with_user(self, token):
        """The sign in and the person it belongs to, in one joined query. None when there is no such sign in."""
        return UserSession.objects.select_related('user').filter(
            pk=token.payload['sid'], user_id=token.payload.get(api_settings.USER_ID_CLAIM),
        ).first()

    def authenticate(self, request):
        # Same steps as simplejwt's authenticate, except that the person is read together with the session. Two
        # separate lookups cost two round trips to the database on every request, and the round trip is most of the time.
        header = self.get_header(request)
        raw_token = self.get_raw_token(header) if header is not None else None
        if raw_token is None:
            return None
        token = self.get_validated_token(raw_token)
        request.session_id = token.payload.get('sid')

        session = self._session_with_user(token) if request.session_id else None
        # A token with no session id is from before sessions existed. A session id with no session is refused below.
        user = self._must_be_active(session.user) if session is not None else self.get_user(token)

        is_admin = user.role == Role.ADMIN
        if is_admin and not request.session_id:
            raise AuthenticationFailed(MFA_MESSAGE, code='mfa_required')
        if request.session_id:
            now = timezone.now()
            if session is None or session.revoked_at is not None or now >= session.expires_at:
                raise AuthenticationFailed('Your session has ended. Please sign in again.', code='session_revoked')
            if is_admin and session.mfa_verified_at is None:
                raise AuthenticationFailed(MFA_MESSAGE, code='mfa_required')
            limit = idle_limit(user, session.is_shared_device)
            if limit is not None and now - session.last_activity_at > limit:
                raise AuthenticationFailed(IDLE_MESSAGE, code='session_idle')
            if now - session.last_activity_at >= TOUCH_EVERY:
                UserSession.objects.filter(pk=request.session_id, last_activity_at__lt=now - TOUCH_EVERY).update(last_activity_at=now)
        return user, token
