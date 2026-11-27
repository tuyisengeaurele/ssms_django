"""The announcements that are up, for people signed in and for visitors, and the admin's side of writing them."""
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from audit_log.changes import build_changes, snapshot
from audit_log.utils import log_action
from core.permissions import RolePermission
from core.utils import api_error, api_success

from .models import Announcement
from .serializers import AnnouncementSerializer

# A page shows two at most. A few more are sent, so that closing one can bring the next.
AT_MOST = 10
# The admin's list keeps every announcement ever written. Only the latest are sent, which is years of them.
HISTORY = 200

# A change to any of these shows the banner again to somebody who had closed it.
SAID = ('kind', 'text_en', 'text_fr', 'text_rw')
RECORDED = (*SAID, 'show_public', 'show_from', 'show_until', 'ended_at')


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


def status_of(announcement, now) -> str:
    if announcement.ended_at is not None or announcement.show_until <= now:
        return 'ended'
    return 'scheduled' if announcement.show_from > now else 'showing'


def admin_row(announcement, now) -> dict:
    author = announcement.created_by
    return {
        **banner_row(announcement),
        'show_from': announcement.show_from.isoformat(),
        'show_public': announcement.show_public,
        'ended_at': announcement.ended_at.isoformat() if announcement.ended_at else None,
        'status': status_of(announcement, now),
        'created_by': {'id': author.pk, 'name': author.name} if author else None,
    }


def _refused(serializer):
    return api_error('Please check what you entered and try again.', 422, serializer.errors, code='invalid_input')


def _locked(pk):
    """The row, held until the change is saved, so that two admins cannot end and edit it at the same moment."""
    return get_object_or_404(Announcement.objects.select_for_update(), pk=pk)


def _over():
    return api_error('This announcement has already ended.', 409, code='announcement_ended')


class AdminAnnouncementsView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'announcements'
    actions = {'get': 'list_all'}

    def get(self, request):
        """GET /api/admin/announcements: every announcement, the latest start first."""
        now = timezone.now()
        rows = Announcement.objects.select_related('created_by').order_by('-show_from', '-pk')[:HISTORY]
        return api_success([admin_row(a, now) for a in rows])

    def post(self, request):
        """POST /api/admin/announcements: write one, to show now or later."""
        serializer = AnnouncementSerializer(data=request.data)
        if not serializer.is_valid():
            return _refused(serializer)
        announcement = Announcement.objects.create(**serializer.validated_data, created_by=request.user, updated_by=request.user)
        log_action(request, 'CREATE', 'Announcement', announcement.pk, f'Wrote an announcement ({announcement.kind})',
                   changes=build_changes({}, snapshot(announcement, RECORDED)))
        return api_success(admin_row(announcement, timezone.now()), 'Announcement saved', 201)


class AdminAnnouncementView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'announcements'

    def patch(self, request, pk):
        """PATCH /api/admin/announcements/<id>: change one that has not ended."""
        with transaction.atomic():
            announcement = _locked(pk)
            if status_of(announcement, timezone.now()) == 'ended':
                return _over()
            serializer = AnnouncementSerializer(announcement, data=request.data, partial=True)
            if not serializer.is_valid():
                return _refused(serializer)
            before = snapshot(announcement, RECORDED)
            for field, value in serializer.validated_data.items():
                setattr(announcement, field, value)
            if any(getattr(announcement, field) != before[field] for field in SAID):
                announcement.version += 1
            announcement.updated_by = request.user
            announcement.save()
        log_action(request, 'UPDATE', 'Announcement', announcement.pk, 'Changed an announcement',
                   changes=build_changes(before, snapshot(announcement, RECORDED)))
        return api_success(admin_row(announcement, timezone.now()), 'Announcement saved')


class AdminAnnouncementEndView(APIView):
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'announcements'
    actions = {'post': 'update'}

    def post(self, request, pk):
        """POST /api/admin/announcements/<id>/end: take it down now, or call off one that is waiting. It is kept."""
        with transaction.atomic():
            announcement = _locked(pk)
            now = timezone.now()
            if status_of(announcement, now) == 'ended':
                return _over()
            before = snapshot(announcement, RECORDED)
            announcement.ended_at = now
            announcement.updated_by = request.user
            announcement.save(update_fields=['ended_at', 'updated_by', 'updated_at'])
        log_action(request, 'UPDATE', 'Announcement', announcement.pk, 'Ended an announcement',
                   changes=build_changes(before, snapshot(announcement, RECORDED)))
        return api_success(admin_row(announcement, now), 'Announcement ended')
