"""
Disease Detection views, POST /api/detections, GET /api/detections/batch/<batch_id>
Accepts an image upload, calls the FastAPI AI service, persists the result.

Images are uploaded to Cloudinary using an unsigned preset so no API secret
is required on the server.  The returned secure_url is stored in image_url.
"""

import io
import logging

import cloudinary
import cloudinary.uploader
import httpx
from django.conf import settings
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from alerts.disease import raise_disease_alert
from audit_log.utils import log_action
from core.access import get_batch_or_404, scope_by_batch
from core.csvsafe import safe_writer
from core.pagination import StandardPagination
from core.params import date_param, int_param
from core.utils import api_error, api_success

from .models import DiseaseDetection
from .serializers import DiseaseDetectionSerializer
from .uploads import validate_image_upload

logger = logging.getLogger(__name__)

# What the check can say about a silkworm, and what it says when the photo is not one. The words are the page's,
# the screens translate them by result.
SILKWORM_RESULTS = ('Grasserie', 'Healthy')
UNCLEAR_PHOTO = {
    'NotSilkworm': 'That does not look like a silkworm. Nothing was saved.',
    'Uncertain': 'The check is not sure about this photo. Nothing was saved.',
}


def _upload_to_cloudinary(uploaded_file) -> str:
    """
    Upload an image to Cloudinary using the unsigned preset.
    No API key or secret needed, the preset is configured in the Cloudinary dashboard.
    Returns the permanent HTTPS URL of the uploaded image.
    """
    cloudinary.config(cloud_name=settings.CLOUDINARY_CLOUD_NAME)
    result = cloudinary.uploader.unsigned_upload(
        uploaded_file.read(),
        settings.CLOUDINARY_UPLOAD_PRESET,
        folder='ssms/detections',
        resource_type='image',
    )
    return result.get('secure_url') or result.get('url', '')


class DiseaseDetectionCreateView(APIView):
    """
    POST /api/detections
    Form fields: batchId (text), image (file), notes (text, optional)
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if request.user.role not in ('FARMER', 'ADMIN', 'SUPERVISOR'):
            return api_error("You don't have permission to do that.", 403)

        batch_id = request.data.get('batchId') or request.data.get('batch_id')
        image_file = request.FILES.get('image')
        notes = request.data.get('notes', '')

        if not batch_id:
            return api_error('Please choose a batch.', 400)
        if not image_file:
            return api_error('Please add a photo.', 400)

        # The batch must exist and be one this person may use. Checked first, so a stranger's
        # request never gets as far as decoding a photo.
        batch = get_batch_or_404(request.user, batch_id)
        batch_id = batch.pk

        try:
            image_type = validate_image_upload(image_file)
        except ValidationError as exc:
            return api_error(str(exc.detail[0]), 422)

        # Call FastAPI AI service
        ai_url = f'{settings.AI_SERVICE_URL}/predict'
        headers = {'X-Internal-Secret': settings.AI_SERVICE_SECRET} if settings.AI_SERVICE_SECRET else {}
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    ai_url,
                    files={'file': (image_file.name, image_file.read(), image_type)},
                    headers=headers,
                )
            if response.status_code != 200:
                logger.error('AI service returned %s: %s', response.status_code, response.text[:300])
                return api_error("The disease check couldn't finish. Please try again.", 502)
            ai_data = response.json()
        except httpx.ConnectError:
            return api_error('The disease check is not available right now. Please try again in a moment.', 503)
        except Exception:
            logger.exception('Could not reach the AI service')
            return api_error("The disease check couldn't finish. Please try again.", 502)

        result = ai_data.get('result') if isinstance(ai_data, dict) else None
        if result in UNCLEAR_PHOTO:
            # A photo that is not a clear silkworm says nothing about the batch. It is not kept, so the counts stay true.
            return api_success(
                {'result': result, 'confidence': ai_data.get('confidence'), 'allScores': ai_data.get('allScores', {})},
                UNCLEAR_PHOTO[result],
            )
        if result not in SILKWORM_RESULTS:
            # Another version of the service may be answering. Better to say so than to keep a result nobody can read.
            logger.error('AI service sent a result this version does not know: %r', result)
            return api_error("The disease check couldn't finish. Please try again.", 502)

        # Reset file pointer so we can upload it
        image_file.seek(0)

        # Upload image to Cloudinary (persistent CDN, survives redeploys)
        try:
            image_url = _upload_to_cloudinary(image_file)
        except Exception:
            logger.exception('Image upload failed')
            return api_error("We couldn't save your photo. Please try again.", 502)

        # Persist detection record
        detection = DiseaseDetection.objects.create(
            batch_id=batch_id,
            image_url=image_url,
            result=ai_data['result'],
            confidence=ai_data['confidence'],
            notes=notes or None,
        )

        payload = DiseaseDetectionSerializer(detection).data
        payload['allScores'] = ai_data.get('allScores', {})
        # The check is already saved. A problem with the alert must not lose the answer the person is waiting for.
        try:
            payload['alert_raised'] = raise_disease_alert(batch, detection.result, detection.confidence, request.user) is not None
        except Exception:
            logger.exception('Could not raise the disease alert for detection %s', detection.pk)
            payload['alert_raised'] = False

        log_action(request, 'CREATE', 'DiseaseDetection', detection.pk,
                   f'Detection: {detection.result} ({detection.confidence:.0%}) on batch {batch_id}')
        return api_success(payload, 'Disease detection completed.', 201)


# What the farmer can say the photo really showed. "Something else" is for a worm that is neither.
ACTUAL_RESULTS = ['Healthy', 'Grasserie', 'Something else']


class DiseaseDetectionFeedbackView(APIView):
    """POST /api/detections/<id>/feedback, {isCorrect, actualResult?}: was the result right, and if not, what was it?

    The latest answer replaces the one before. The people who may see a check may answer for it."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN', 'SUPERVISOR'):
            return api_error("You don't have permission to do that.", 403)
        detection = scope_by_batch(
            request.user, DiseaseDetection.objects.all(),
        ).filter(pk=pk).first()
        if detection is None:
            return api_error("We couldn't find that check.", 404)

        is_correct = request.data.get('is_correct')
        if not isinstance(is_correct, bool):
            message = 'Please say whether the result was correct.'
            return api_error(message, 422, {'is_correct': [message]})
        actual = request.data.get('actual_result')
        if actual is not None and actual not in ACTUAL_RESULTS:
            message = 'Please choose one of the listed results.'
            return api_error(message, 422, {'actual_result': [message]})

        detection.is_correct = is_correct
        # What it really was only means something when the result was wrong.
        detection.actual_result = None if is_correct else actual
        detection.feedback_at = timezone.now()
        detection.save(update_fields=['is_correct', 'actual_result', 'feedback_at'])
        said = 'correct' if is_correct else f'wrong, really {detection.actual_result or "not stated"}'
        log_action(request, 'UPDATE', 'DiseaseDetection', detection.pk, f'Said the result {detection.result} was {said}')
        return api_success(DiseaseDetectionSerializer(detection).data, 'Thank you. Your answer was saved.')


class DiseaseDetectionByBatchView(APIView):
    """GET /api/detections/batch/<batch_id>"""
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        get_batch_or_404(request.user, batch_id)

        detections = (
            DiseaseDetection.objects
            .filter(batch_id=batch_id)
            .order_by('-detected_at')
        )
        return api_success(DiseaseDetectionSerializer(detections, many=True).data)


class DetectionHistoryView(APIView):
    """
    GET /api/detections/history
    Query params: farm_id, date_from (YYYY-MM-DD), date_to (YYYY-MM-DD), limit (default 200)
    Each role sees the detections the access rules allow (see core.access).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error("You don't have permission to do that.", 403)

        qs = DiseaseDetection.objects.select_related('batch', 'batch__farm').order_by('-detected_at')

        qs = scope_by_batch(request.user, qs)

        farm_id   = request.query_params.get('farm_id')
        date_from = date_param(request, 'date_from')
        date_to   = date_param(request, 'date_to')
        limit     = int_param(request, 'limit', 200, 1, 500)

        if farm_id:
            qs = qs.filter(batch__farm_id=farm_id)
        if date_from:
            qs = qs.filter(detected_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(detected_at__date__lte=date_to)

        def _serialize(qs_slice):
            return [
                {
                    'id': d.id,
                    'result': d.result,
                    'confidence': d.confidence,
                    'detected_at': d.detected_at.isoformat(),
                    'batch_id': d.batch_id,
                    'farm_name': d.batch.farm.name if d.batch and d.batch.farm else ',',
                    'farm_id': d.batch.farm_id if d.batch else None,
                    'notes': d.notes,
                    'is_correct': d.is_correct,
                    'actual_result': d.actual_result,
                }
                for d in qs_slice
            ]

        # ── CSV export ──────────────────────────────────────────────────────────
        # NOTE: we deliberately avoid ?format= because DRF intercepts that param
        # for its own content-negotiation pipeline before the view method runs.
        if request.query_params.get('export') == 'csv':
            def _csv_rows(queryset):
                header = ['ID', 'Date', 'Result', 'Confidence (%)', 'Farm', 'Farm ID', 'Batch ID', 'Notes']
                yield header
                for d in queryset:
                    yield [
                        d.id,
                        d.detected_at.strftime('%Y-%m-%d %H:%M:%S'),
                        d.result,
                        f'{d.confidence * 100:.1f}' if d.confidence is not None else '',
                        d.batch.farm.name if d.batch and d.batch.farm else '',
                        d.batch.farm_id if d.batch else '',
                        d.batch_id,
                        d.notes or '',
                    ]

            def _stream():
                buffer = io.StringIO()
                writer = safe_writer(buffer)
                for row in _csv_rows(qs[:limit]):
                    writer.writerow(row)
                    yield buffer.getvalue()
                    buffer.seek(0)
                    buffer.truncate(0)

            response = StreamingHttpResponse(_stream(), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="disease_detections.csv"'
            return response

        # ── Paginated JSON ───────────────────────────────────────────────────────
        if 'page' in request.query_params:
            paginator = StandardPagination()
            page = paginator.paginate_queryset(qs, request)
            if page is not None:
                return paginator.get_paginated_response(_serialize(page))

        return api_success(_serialize(qs[:limit]))


class DetectionStatsView(APIView):
    """
    GET /api/detections/stats
    Returns {result: count} aggregate, used for the frequency chart.
    Same filters as DetectionHistoryView.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error("You don't have permission to do that.", 403)

        from django.db.models import Count

        qs = scope_by_batch(request.user, DiseaseDetection.objects.all())

        farm_id   = request.query_params.get('farm_id')
        date_from = date_param(request, 'date_from')
        date_to   = date_param(request, 'date_to')

        if farm_id:
            qs = qs.filter(batch__farm_id=farm_id)
        if date_from:
            qs = qs.filter(detected_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(detected_at__date__lte=date_to)

        stats = (
            qs.values('result')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        return api_success(list(stats))


class RecentDetectionsView(APIView):
    """GET /api/detections/recent?limit=20, supervisor-wide detection history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)

        limit = int_param(request, 'limit', 20, 1, 100)

        detections = (
            DiseaseDetection.objects
            .select_related('batch', 'batch__farm')
            .order_by('-detected_at')
        )
        detections = scope_by_batch(request.user, detections)
        detections = detections[:limit]

        data = [
            {
                'id': d.id,
                'result': d.result,
                'confidence': d.confidence,
                'detected_at': d.detected_at.isoformat(),
                'batch_id': d.batch_id,
                'farm_name': d.batch.farm.name if d.batch and d.batch.farm else ',',
                'farm_id': d.batch.farm_id if d.batch else None,
            }
            for d in detections
        ]
        return api_success(data)
