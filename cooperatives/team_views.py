"""A supervisor's team: invitation links, the farmers of the cooperative, and removing one. /api/team and /api/invitations."""
import logging

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.serializers import EmailField, ValidationError
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.throttles import InvitationRateThrottle
from core.utils import api_error, api_success
from users.models import User

from . import invitations
from .models import Cooperative, CooperativeInvitation

logger = logging.getLogger(__name__)


def team_cooperative(request):
    """The cooperative a team request is about: a supervisor's own, or the one an admin names. (cooperative, error)."""
    user = request.user
    if user.role == 'SUPERVISOR':
        if not user.cooperative_id:
            return None, api_error('You are not part of a cooperative yet.', 403)
        return user.cooperative, None
    if user.role == 'ADMIN':
        coop_id = request.query_params.get('cooperativeId') or request.data.get('cooperative_id')
        if not coop_id:
            return None, api_error('Please choose a cooperative.', 422)
        coop = Cooperative.objects.filter(pk=coop_id, is_active=True).first()
        if coop is None:
            return None, api_error("We couldn't find that cooperative.", 404)
        return coop, None
    return None, api_error("You don't have permission to do that.", 403)


def _row(invitation: CooperativeInvitation) -> dict:
    return {
        'id': invitation.pk,
        'email': invitation.email,
        'status': invitation.status,
        'created_at': invitation.created_at,
        'expires_at': invitation.expires_at,
        'invited_by_name': invitation.invited_by.name if invitation.invited_by else '',
        'accepted_by_name': invitation.accepted_by.name if invitation.accepted_by else '',
    }


class TeamInvitationListView(APIView):
    """GET lists the invitations of the cooperative. POST makes one and returns its link, which is shown only once."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        coop, err = team_cooperative(request)
        if err:
            return err
        rows = coop.invitations.select_related('invited_by', 'accepted_by')
        return api_success([_row(r) for r in rows])

    def post(self, request):
        coop, err = team_cooperative(request)
        if err:
            return err
        email = str(request.data.get('email') or '').strip()
        if email:
            try:
                email = EmailField().run_validation(email)
            except ValidationError:
                return api_error('Please enter a valid email address.', 422, {'email': ['Please enter a valid email address.']})

        invitation, token = invitations.issue(coop, request.user, email)
        log_action(request, 'CREATE', 'Invitation', invitation.pk, f'Invited a farmer to {coop.name}')

        message = 'Invitation created.'
        if invitation.email:
            try:
                invitations.send_invitation_email(invitation, token)
                message = 'Invitation created and sent by email.'
            except Exception:
                logger.exception('Could not send the invitation email to %s', invitation.email)
                message = 'Invitation created. The email could not be sent, so share the link yourself.'
        data = {**_row(invitation), 'link': invitations.link_for(token)}
        return api_success(data, message, 201)


class TeamInvitationDetailView(APIView):
    """DELETE revokes a pending invitation, and its link stops working."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, invitation_id):
        coop, err = team_cooperative(request)
        if err:
            return err
        invitation = coop.invitations.filter(pk=invitation_id).first()
        if invitation is None:
            return api_error("We couldn't find that invitation.", 404)
        if invitation.status != 'pending':
            return api_error('That invitation can no longer be changed.', 409)
        invitation.revoked_at = timezone.now()
        invitation.save(update_fields=['revoked_at'])
        log_action(request, 'DELETE', 'Invitation', invitation.pk, f'Revoked an invitation to {coop.name}')
        return api_success(None, 'Invitation revoked.')


class TeamFarmerListView(APIView):
    """GET /api/team/farmers, the farmers of the cooperative with how many farms each has."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        coop, err = team_cooperative(request)
        if err:
            return err
        farmers = (
            User.objects.filter(cooperative=coop, role='FARMER', is_active=True)
            .annotate(farm_count=Count('farms', filter=Q(farms__is_active=True)))
            .order_by('name')
        )
        return api_success([
            {'id': f.pk, 'name': f.name, 'email': f.email, 'joined_at': f.created_at, 'farm_count': f.farm_count}
            for f in farmers
        ])


class TeamFarmerDetailView(APIView):
    """DELETE takes a farmer out of the cooperative. Their account and farms stay."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, user_id):
        coop, err = team_cooperative(request)
        if err:
            return err
        farmer = User.objects.filter(pk=user_id, cooperative=coop, role='FARMER', is_active=True).first()
        if farmer is None:
            return api_error("We couldn't find that farmer.", 404)
        farmer.cooperative = None
        farmer.save(update_fields=['cooperative'])
        log_action(request, 'UPDATE', 'User', farmer.pk, f'Removed {farmer.email} from {coop.name}')
        return api_success(None, 'Farmer removed from the cooperative.')


class InvitationDetailView(APIView):
    """GET /api/invitations/<token>, what the page behind a link shows. Public, and one answer for every bad link."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [InvitationRateThrottle]

    def get(self, request, token):
        invitation = invitations.find_pending(token)
        if invitation is None:
            return api_error(invitations.NO_LONGER_VALID, 404)
        return api_success({
            'cooperative_name': invitation.cooperative.name,
            'invited_by_name': invitation.invited_by.name if invitation.invited_by else '',
            'email': invitation.email,
        })


class InvitationAcceptView(APIView):
    """POST /api/invitations/<token>/accept, a signed in farmer joins the cooperative."""
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        if request.user.role != 'FARMER':
            return api_error("You don't have permission to do that.", 403)
        invitation = invitations.find_pending(token)
        if invitation is None:
            return api_error(invitations.NO_LONGER_VALID, 404)
        if invitation.email and invitation.email != request.user.email.lower():
            return api_error('This invitation was sent to a different email address.', 403)
        if request.user.cooperative_id == invitation.cooperative_id:
            return api_success(None, 'You are already in this cooperative.')
        try:
            invitations.accept(invitation, request.user)
        except invitations.InvalidInvitation:
            return api_error(invitations.NO_LONGER_VALID, 404)
        log_action(request, 'UPDATE', 'User', request.user.pk, f'{request.user.email} joined {invitation.cooperative.name} by invitation')
        return api_success(None, f'You joined {invitation.cooperative.name}.')
