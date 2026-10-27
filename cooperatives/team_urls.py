from django.urls import path

from .team_views import (
    TeamFarmerDetailView,
    TeamFarmerListView,
    TeamInvitationDetailView,
    TeamInvitationListView,
)

urlpatterns = [
    path('/invitations', TeamInvitationListView.as_view(), name='team_invitations'),                       # GET / POST /api/team/invitations
    path('/invitations/<str:invitation_id>', TeamInvitationDetailView.as_view(), name='team_invitation'),   # DELETE (revoke)
    path('/farmers', TeamFarmerListView.as_view(), name='team_farmers'),                                    # GET /api/team/farmers
    path('/farmers/<str:user_id>', TeamFarmerDetailView.as_view(), name='team_farmer'),                     # DELETE (remove)
]
