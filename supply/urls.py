from django.urls import path

from .views import (
    AllowanceDecisionView,
    AllowanceFarmerView,
    AllowanceRequestDetailView,
    AllowanceRequestListView,
    AllowanceView,
    SupplySettingsView,
)

urlpatterns = [
    path('/allowance', AllowanceView.as_view(), name='supply_allowance'),                                                   # GET the farmer's card
    path('/allowance/requests', AllowanceRequestListView.as_view(), name='supply_allowance_requests'),                      # GET (staff) / POST (farmer)
    path('/allowance/requests/<str:pk>', AllowanceRequestDetailView.as_view(), name='supply_allowance_request'),            # DELETE (withdraw)
    path('/allowance/requests/<str:pk>/decision', AllowanceDecisionView.as_view(), name='supply_allowance_decision'),       # POST (staff)
    path('/allowance/farmers/<str:pk>', AllowanceFarmerView.as_view(), name='supply_allowance_farmer'),                     # PATCH (staff)
    path('/settings', SupplySettingsView.as_view(), name='supply_settings'),                                                # GET (staff) / PATCH (admin)
]
