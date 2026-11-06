from django.urls import path

from .admin_views import (
    AdminUserCooperativeView,
    AdminUserDeactivateView,
    AdminUserListCreateView,
    AdminUserRestoreView,
    AdminUserRoleView,
)
from .mfa_views import AdminMfaResetView

urlpatterns = [
    path('/users', AdminUserListCreateView.as_view(), name='admin_user_list_create'),                          # GET / POST
    path('/users/<str:user_id>/role', AdminUserRoleView.as_view(), name='admin_user_role'),                    # PATCH
    path('/users/<str:user_id>/cooperative', AdminUserCooperativeView.as_view(), name='admin_user_coop'),      # PATCH
    path('/users/<str:user_id>/restore', AdminUserRestoreView.as_view(), name='admin_user_restore'),          # POST
    path('/users/<str:user_id>/mfa/reset', AdminMfaResetView.as_view(), name='admin_user_mfa_reset'),        # POST
    path('/users/<str:user_id>', AdminUserDeactivateView.as_view(), name='admin_user_delete'),                 # DELETE
]
