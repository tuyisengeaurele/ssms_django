"""Admin-only user management views, /api/admin/users."""
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from cooperatives.models import Cooperative
from core.tokens import revoke_all_refresh_tokens
from core.utils import api_error, api_success

from .serializers import AdminCreateUserSerializer, UserSerializer

User = get_user_model()
logger = logging.getLogger(__name__)

ROLE_WORDS = {'ADMIN': 'an administrator', 'SUPERVISOR': 'a supervisor', 'FARMER': 'a farmer'}


def _require_admin(user):
    if user.role != 'ADMIN':
        return api_error('Only administrators can do that.', 403)
    return None


def _send_invitation(user):
    """Email a link that lets a new person choose their own password."""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    role = ROLE_WORDS.get(user.role, 'a user')
    link = f'{frontend_url}/reset-password?uid={uid}&token={token}'
    message = '\n'.join([
        f'Hi {user.name},',
        '',
        f'An administrator has created an SSMS account for you as {role}.',
        '',
        'Choose your password with this link (it works for 1 hour):',
        link,
        '',
        'If the link has expired, open the sign in page and use "Forgot password".',
        '',
        'The SSMS Team',
    ])
    send_mail(
        subject='You have been added to SSMS',
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


class AdminUserListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """GET /api/admin/users, list every user."""
        err = _require_admin(request.user)
        if err:
            return err
        users = User.objects.all().order_by('role', 'name')
        return api_success(UserSerializer(users, many=True).data)

    def post(self, request):
        """POST /api/admin/users, an admin adds a person with the role they choose."""
        err = _require_admin(request.user)
        if err:
            return err
        serializer = AdminCreateUserSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        had_password = bool(serializer.validated_data['password'])
        user = serializer.save()
        log_action(request, 'CREATE', 'User', user.pk, f'Admin created user {user.email} with role {user.role}')

        message = 'User created.'
        if not had_password:
            try:
                _send_invitation(user)
            except Exception:
                logger.exception('Could not send the invitation email to %s', user.email)
                message = ('User created. The invitation email could not be sent. '
                           'Ask them to use "Forgot password" on the sign in page.')
        return api_success(UserSerializer(user).data, message, 201)


class AdminUserRoleView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        """PATCH /api/admin/users/<id>/role, change a user's role."""
        err = _require_admin(request.user)
        if err:
            return err
        if user_id == request.user.id:
            return api_error("You can't change your own role.", 400)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return api_error("We couldn't find that user.", 404)

        new_role = request.data.get('role')
        if new_role not in ('ADMIN', 'SUPERVISOR', 'FARMER'):
            return api_error('Please choose a valid role.', 400)

        old_role = user.role
        user.role = new_role
        user.save(update_fields=['role'])
        log_action(request, 'UPDATE', 'User', user.pk, f'Role changed {old_role} → {new_role} for {user.email}')
        return api_success(UserSerializer(user).data, 'Role updated.')


class AdminUserDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, user_id):
        """DELETE /api/admin/users/<id>, deactivate a user (soft delete)."""
        err = _require_admin(request.user)
        if err:
            return err
        if user_id == request.user.id:
            return api_error("You can't turn off your own account.", 400)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return api_error("We couldn't find that user.", 404)

        user.is_active = False
        user.save(update_fields=['is_active'])
        revoke_all_refresh_tokens(user)
        log_action(request, 'DELETE', 'User', user.pk, f'Deactivated user {user.email}')
        return api_success(None, 'User deactivated.')


class AdminUserCooperativeView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        """PATCH /api/admin/users/<id>/cooperative, assign or remove cooperative."""
        err = _require_admin(request.user)
        if err:
            return err
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return api_error("We couldn't find that user.", 404)

        # CamelCaseJSONParser converts incoming camelCase → snake_case
        cooperative_id = request.data.get('cooperative_id')

        # Admins manage cooperatives globally, they cannot belong to one
        if user.role == 'ADMIN':
            return api_error("Administrators don't belong to a cooperative.", 400)

        if cooperative_id is None or cooperative_id == '':
            # Unassign
            user.cooperative = None
        else:
            try:
                coop = Cooperative.objects.get(pk=cooperative_id, is_active=True)
            except Cooperative.DoesNotExist:
                return api_error("We couldn't find that cooperative.", 404)
            user.cooperative = coop

        user.save(update_fields=['cooperative'])
        coop_name = user.cooperative.name if user.cooperative else 'none'
        log_action(request, 'UPDATE', 'User', user.pk, f'Cooperative set to {coop_name} for {user.email}')
        return api_success(UserSerializer(user).data, 'Cooperative updated.')
