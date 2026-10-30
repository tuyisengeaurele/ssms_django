"""The QR code link of a harvest lot: the owner makes it and ends it, and anyone with the link can read the page."""
import secrets

from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.access import scope_by_batch
from core.throttles import LotRateThrottle
from core.utils import api_error, api_success

from .lots import NO_LONGER_VALID, public_lot
from .models import HarvestRecord


class LotShareView(APIView):
    """/api/harvest/<id>/share. GET reads the link, POST makes it (or gives the one that exists), DELETE ends it.

    Not for supervisors, who may read lots but not change them. The link is a secret, so it is not in the harvest list and
    not in the audit log.
    """
    permission_classes = [IsAuthenticated]

    def _lot(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return None, api_error("You don't have permission to do that.", 403)
        record = scope_by_batch(
            request.user, HarvestRecord.objects.live().select_related('batch__farm'),
        ).filter(pk=pk).first()
        if record is None:
            return None, api_error("We couldn't find that record.", 404)
        return record, None

    @staticmethod
    def _link(record):
        return {'token': record.share_token, 'shared_at': record.shared_at}

    def get(self, request, pk):
        record, error = self._lot(request, pk)
        return error or api_success(self._link(record))

    def post(self, request, pk):
        record, error = self._lot(request, pk)
        if error:
            return error
        if record.share_token:
            return api_success(self._link(record))
        record.share_token = secrets.token_urlsafe(16)
        record.shared_at = timezone.now()
        record.save(update_fields=['share_token', 'shared_at'])
        log_action(request, 'UPDATE', 'HarvestRecord', record.pk, 'Shared the lot through a QR code link')
        return api_success(self._link(record), 'The lot can now be seen through its QR code.', 201)

    def delete(self, request, pk):
        record, error = self._lot(request, pk)
        if error:
            return error
        if record.share_token:
            record.share_token = None
            record.shared_at = None
            record.save(update_fields=['share_token', 'shared_at'])
            log_action(request, 'UPDATE', 'HarvestRecord', record.pk, 'Stopped sharing the lot through its QR code link')
        return api_success(None, 'The QR code no longer works.')


class PublicLotView(APIView):
    """GET /api/lots/<token>, the page behind a QR code. Public, and one answer for every bad link."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LotRateThrottle]

    def get(self, request, token):
        record = None
        if token:
            record = (
                HarvestRecord.objects.live()
                .filter(share_token=token, batch__is_active=True, batch__farm__is_active=True)
                .select_related('batch__farm__owner__cooperative')
                .first()
            )
        if record is None:
            response = api_error(NO_LONGER_VALID, 404)
        else:
            response = api_success(public_lot(record))
        # A link can be ended at any time, so nothing about it is kept, and a lot is not for search engines.
        response['Cache-Control'] = 'no-store'
        response['X-Robots-Tag'] = 'noindex, nofollow'
        return response
