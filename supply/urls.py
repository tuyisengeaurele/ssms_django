from django.urls import path

from .round_views import (
    CurrentRoundView,
    EggRequestDetailView,
    EggRequestReceiptView,
    NotCollectedView,
    RoundActionView,
    RoundConfirmView,
    RoundDetailView,
    RoundListView,
    RoundProposalView,
    RoundRequestView,
)
from .views import (
    AllowanceDecisionView,
    AllowanceFarmerView,
    AllowanceRequestDetailView,
    AllowanceRequestListView,
    AllowanceView,
    OnboardingView,
    SupplySettingsView,
)

urlpatterns = [
    path('/allowance', AllowanceView.as_view(), name='supply_allowance'),                                                   # GET the farmer's card
    path('/allowance/requests', AllowanceRequestListView.as_view(), name='supply_allowance_requests'),                      # GET (staff) / POST (farmer)
    path('/allowance/requests/<str:pk>', AllowanceRequestDetailView.as_view(), name='supply_allowance_request'),            # DELETE (withdraw)
    path('/allowance/requests/<str:pk>/decision', AllowanceDecisionView.as_view(), name='supply_allowance_decision'),       # POST (staff)
    path('/allowance/farmers/<str:pk>', AllowanceFarmerView.as_view(), name='supply_allowance_farmer'),                     # PATCH (staff)
    path('/onboarding', OnboardingView.as_view(), name='supply_onboarding'),                                                 # GET (farmer)
    path('/settings', SupplySettingsView.as_view(), name='supply_settings'),
    path('/rounds', RoundListView.as_view(), name='supply_rounds'),                                                         # GET / POST (staff)
    path('/rounds/current', CurrentRoundView.as_view(), name='supply_round_current'),                                       # GET (farmer)
    path('/rounds/<str:pk>', RoundDetailView.as_view(), name='supply_round'),                                               # GET / PATCH (staff)
    path('/rounds/<str:pk>/action', RoundActionView.as_view(), name='supply_round_action'),                                 # POST (staff)
    path('/rounds/<str:pk>/proposal', RoundProposalView.as_view(), name='supply_round_proposal'),                           # GET (staff)
    path('/rounds/<str:pk>/confirm', RoundConfirmView.as_view(), name='supply_round_confirm'),                              # POST (staff)
    path('/rounds/<str:pk>/requests', RoundRequestView.as_view(), name='supply_round_request'),                             # POST (farmer)
    path('/requests/<str:pk>', EggRequestDetailView.as_view(), name='supply_request'),                                      # DELETE (farmer)
    path('/requests/<str:pk>/receipt', EggRequestReceiptView.as_view(), name='supply_request_receipt'),                     # POST (farmer or staff)
    path('/requests/<str:pk>/not-collected', NotCollectedView.as_view(), name='supply_request_not_collected'),              # POST (staff)                                                # GET (staff) / PATCH (admin)
]
