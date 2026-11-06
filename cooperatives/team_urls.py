from django.urls import path

from .team_views import (
    TeamDecisionsView,
    TeamFarmerDetailView,
    TeamFarmerListView,
    TeamInvitationDetailView,
    TeamInvitationListView,
    TeamRoomListView,
)

urlpatterns = [
    path('/invitations', TeamInvitationListView.as_view(), name='team_invitations'),                       # GET / POST /api/team/invitations
    path('/invitations/<str:invitation_id>', TeamInvitationDetailView.as_view(), name='team_invitation'),   # DELETE (revoke)
    path('/farmers', TeamFarmerListView.as_view(), name='team_farmers'),                                    # GET /api/team/farmers
    path('/farmers/<str:user_id>', TeamFarmerDetailView.as_view(), name='team_farmer'),                     # DELETE (remove)
    path('/rooms', TeamRoomListView.as_view(), name='team_rooms'),                                          # GET /api/team/rooms
    path('/decisions', TeamDecisionsView.as_view(), name='team_decisions'),                                 # GET /api/team/decisions (counts)
]
