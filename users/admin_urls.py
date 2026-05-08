from django.urls import path
from .admin_views import (
    AdminUserListCreateView, AdminUserRoleView,
    AdminUserDeactivateView, AdminUserCooperativeView,
)

urlpatterns = [
    path('/users', AdminUserListCreateView.as_view(), name='admin_user_list_create'),                          # GET / POST
    path('/users/<str:user_id>/role', AdminUserRoleView.as_view(), name='admin_user_role'),                    # PATCH
    path('/users/<str:user_id>/cooperative', AdminUserCooperativeView.as_view(), name='admin_user_coop'),      # PATCH
    path('/users/<str:user_id>', AdminUserDeactivateView.as_view(), name='admin_user_delete'),                 # DELETE
]
