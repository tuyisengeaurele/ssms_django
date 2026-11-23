from django.urls import path

from .change_request_views import (
    AccountCooperativeRequestView,
    AdminCooperativeRequestDecisionView,
    AdminCooperativeRequestListView,
)

# Under /api/account.
account_urlpatterns = [
    path('/cooperative-request', AccountCooperativeRequestView.as_view(), name='account_cooperative_request'),
]

# Under /api/admin/cooperative-requests.
admin_urlpatterns = [
    path('', AdminCooperativeRequestListView.as_view(), name='admin_cooperative_requests'),
    path('/<str:pk>/decision', AdminCooperativeRequestDecisionView.as_view(), name='admin_cooperative_request_decision'),
]
