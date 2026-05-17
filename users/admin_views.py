"""Admin-only user management views — /api/admin/users."""

from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .serializers import UserSerializer, RegisterSerializer
from core.utils import api_success, api_error
from cooperatives.models import Cooperative
from audit_log.utils import log_action

User = get_user_model()


def _require_admin(user):
    if user.role != 'ADMIN':
        return api_error('Forbidden. Admin only.', 403)
    return None


class AdminUserListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """GET /api/admin/users — list every user."""
        err = _require_admin(request.user)
        if err:
            return err
        users = User.objects.all().order_by('role', 'name')
        return api_success(UserSerializer(users, many=True).data)

    def post(self, request):
        """POST /api/admin/users — admin creates a user with any role."""
        err = _require_admin(request.user)
        if err:
            return err
        serializer = RegisterSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return api_error('Validation failed.', 422, serializer.errors)
        user = serializer.save()
        log_action(request, 'CREATE', 'User', user.pk, f'Admin created user {user.email} with role {user.role}')
        return api_success(UserSerializer(user).data, 'User created.', 201)


class AdminUserRoleView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        """PATCH /api/admin/users/<id>/role — change a user's role."""
        err = _require_admin(request.user)
        if err:
            return err
        if user_id == request.user.id:
            return api_error('You cannot change your own role.', 400)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return api_error('User not found.', 404)

        new_role = request.data.get('role')
        if new_role not in ('ADMIN', 'SUPERVISOR', 'FARMER'):
            return api_error('role must be ADMIN, SUPERVISOR, or FARMER.', 400)

        old_role = user.role
        user.role = new_role
        user.save(update_fields=['role'])
        log_action(request, 'UPDATE', 'User', user.pk, f'Role changed {old_role} → {new_role} for {user.email}')
        return api_success(UserSerializer(user).data, 'Role updated.')


class AdminUserDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, user_id):
        """DELETE /api/admin/users/<id> — deactivate a user (soft delete)."""
        err = _require_admin(request.user)
        if err:
            return err
        if user_id == request.user.id:
            return api_error('You cannot deactivate yourself.', 400)
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return api_error('User not found.', 404)

        user.is_active = False
        user.save(update_fields=['is_active'])
        log_action(request, 'DELETE', 'User', user.pk, f'Deactivated user {user.email}')
        return api_success(None, 'User deactivated.')


class AdminUserCooperativeView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        """PATCH /api/admin/users/<id>/cooperative — assign or remove cooperative."""
        err = _require_admin(request.user)
        if err:
            return err
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return api_error('User not found.', 404)

        # CamelCaseJSONParser converts incoming camelCase → snake_case
        cooperative_id = request.data.get('cooperative_id')

        # Admins manage cooperatives globally — they cannot belong to one
        if user.role == 'ADMIN':
            return api_error('Admin users cannot be assigned to a cooperative.', 400)

        if cooperative_id is None or cooperative_id == '':
            # Unassign
            user.cooperative = None
        else:
            try:
                coop = Cooperative.objects.get(pk=cooperative_id, is_active=True)
            except Cooperative.DoesNotExist:
                return api_error('Cooperative not found.', 404)
            user.cooperative = coop

        user.save(update_fields=['cooperative'])
        return api_success(UserSerializer(user).data, 'Cooperative updated.')
