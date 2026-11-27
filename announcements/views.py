"""Reading the announcements that are up: one route for people signed in, one for visitors."""
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from core.permissions import RolePermission
from core.utils import api_success

from .models import Announcement

# A page shows two at most. A few more are sent, so that closing one can bring the next.
AT_MOST = 10


def banner_row(announcement) -> dict:
    """What a banner needs and nothing else: no author, no start, no say in who else sees it."""
    return {
        'id': announcement.pk,
        'kind': announcement.kind,
        'text': {'en': announcement.text_en, 'fr': announcement.text_fr, 'rw': announcement.text_rw},
        'version': announcement.version,
        'show_until': announcement.show_until.isoformat(),
    }


class CurrentAnnouncementsView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'announcements'

    def get(self, request):
        """GET /api/announcements: the announcements showing now, for anybody signed in."""
        return api_success([banner_row(a) for a in Announcement.objects.showing(timezone.now())[:AT_MOST]])


class PublicAnnouncementsView(APIView):
    # A token left over in a visitor's browser is not looked at: it must never turn this into a refusal.
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        """GET /api/announcements/public: the announcements marked for visitors that are showing now."""
        rows = Announcement.objects.showing(timezone.now()).filter(show_public=True)[:AT_MOST]
        response = api_success([banner_row(a) for a in rows])
        response['Cache-Control'] = 'public, max-age=60'
        return response
