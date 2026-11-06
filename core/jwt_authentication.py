from datetime import timedelta

from django.utils import timezone
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.settings import api_settings

from support_access import services as support
from support_access.models import SupportAccess
from users.models import Role, UserSession
from users.sessions import IDLE_MESSAGE, idle_limit

# Using the site moves the idle clock, but it is written at most this often, so a busy page costs one write a minute.
TOUCH_EVERY = timedelta(seconds=60)

MFA_MESSAGE = 'Please sign in again and enter the code from your authenticator app.'
SUPPORT_ENDED_MESSAGE = 'The support session has ended.'


def _support_ended():
    return AuthenticationFailed(SUPPORT_ENDED_MESSAGE, code='support_ended')


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

    def _support_problem(self, session, access, now):
        """Why a support visit may not go on, as (who ended it, why), or None when it may."""
        admin = access.admin
        admin_session = access.admin_session
        if session.revoked_at is not None or access.status != SupportAccess.Status.ACTIVE:
            return 'system', 'not_active'
        if now >= access.ends_at or now >= session.expires_at:
            return 'time', 'time_up'
        if admin is None or not admin.is_active or admin.role != Role.ADMIN:
            return 'system', 'admin_gone'
        # The admin's own sign in must still be alive. Sitting idle does not count: they are working in the person's view.
        if admin_session is None or admin_session.revoked_at is not None or now >= admin_session.expires_at:
            return 'system', 'admin_signed_out'
        if not session.user.is_active or session.user.role not in support.TARGET_ROLES:
            return 'system', 'person_changed'
        return None

    def _act_as_person(self, request, token):
        """A token made by support access. Everything is read from the rows, and the claims only point at them.

        The session is read together with the person, the request and the admin, so this is still one query.
        """
        session = None
        if request.session_id:
            session = UserSession.objects.select_related(
                'user', 'support_access', 'support_access__admin', 'support_access__admin_session',
            ).filter(pk=request.session_id, user_id=token.payload.get(api_settings.USER_ID_CLAIM)).first()
        access = session.support_access if session is not None else None
        if access is None or str(token.payload.get('act')) != str(access.admin_id):
            raise _support_ended()

        problem = self._support_problem(session, access, timezone.now())
        if problem:
            support.end_support_access(access, *problem)
            raise _support_ended()

        request.acting_admin = access.admin
        request.support = access
        # The request log reads the Django request, not the REST framework one.
        request._request.support_access_id = access.id
        return session.user, token

    def authenticate(self, request):
        # Same steps as simplejwt's authenticate, except that the person is read together with the session. Two
        # separate lookups cost two round trips to the database on every request, and the round trip is most of the time.
        header = self.get_header(request)
        raw_token = self.get_raw_token(header) if header is not None else None
        if raw_token is None:
            return None
        token = self.get_validated_token(raw_token)
        request.session_id = token.payload.get('sid')
        if 'act' in token.payload:
            return self._act_as_person(request, token)

        session = self._session_with_user(token) if request.session_id else None
        if session is not None and session.support_access_id is not None:
            # A sign in made for support access, shown without the claim that says so. Only support access may use it.
            raise _support_ended()
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
