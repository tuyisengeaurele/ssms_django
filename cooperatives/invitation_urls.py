from django.urls import path

from .team_views import InvitationAcceptView, InvitationDetailView

urlpatterns = [
    path('/<str:token>', InvitationDetailView.as_view(), name='invitation_detail'),            # GET /api/invitations/<token> (public)
    path('/<str:token>/accept', InvitationAcceptView.as_view(), name='invitation_accept'),     # POST (signed in farmer)
]
