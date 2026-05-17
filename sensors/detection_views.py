"""
Disease Detection views — POST /api/detections, GET /api/detections/batch/<batch_id>
Accepts an image upload, calls the FastAPI AI service, persists the result.

Images are uploaded to Cloudinary using an unsigned preset so no API secret
is required on the server.  The returned secure_url is stored in image_url.
"""

import csv
import io
import cloudinary
import cloudinary.uploader
import httpx
from django.conf import settings
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from batches.models import Batch
from .models import DiseaseDetection
from .serializers import DiseaseDetectionSerializer
from core.utils import api_success, api_error
from core.pagination import StandardPagination
from audit_log.utils import log_action


def _upload_to_cloudinary(uploaded_file) -> str:
    """
    Upload an image to Cloudinary using the unsigned preset.
    No API key or secret needed — the preset is configured in the Cloudinary dashboard.
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
            return api_error('Forbidden. Insufficient permissions.', 403)

        batch_id = request.data.get('batchId') or request.data.get('batch_id')
        image_file = request.FILES.get('image')
        notes = request.data.get('notes', '')

        if not batch_id:
            return api_error('batchId is required.', 400)
        if not image_file:
            return api_error('image file is required.', 400)

        # Validate batch exists
        try:
            Batch.objects.get(pk=batch_id, is_active=True)
        except Batch.DoesNotExist:
            return api_error('Batch not found.', 404)

        # Call FastAPI AI service
        ai_url = f'{settings.AI_SERVICE_URL}/predict'
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    ai_url,
                    files={'file': (image_file.name, image_file.read(), image_file.content_type)},
                )
            if response.status_code != 200:
                return api_error(f'AI service error: {response.text}', 502)
            ai_data = response.json()
        except httpx.ConnectError:
            return api_error('AI service is unavailable. Ensure it is running on port 8001.', 503)
        except Exception as exc:
            return api_error(f'Failed to reach AI service: {exc}', 502)

        # Reset file pointer so we can upload it
        image_file.seek(0)

        # Upload image to Cloudinary (persistent CDN — survives redeploys)
        try:
            image_url = _upload_to_cloudinary(image_file)
        except Exception as exc:
            return api_error(f'Image upload failed: {exc}', 502)

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

        log_action(request, 'CREATE', 'DiseaseDetection', detection.pk,
                   f'Detection: {detection.result} ({detection.confidence:.0%}) on batch {batch_id}')
        return api_success(payload, 'Disease detection completed.', 201)


class DiseaseDetectionByBatchView(APIView):
    """GET /api/detections/batch/<batch_id>"""
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        try:
            Batch.objects.get(pk=batch_id, is_active=True)
        except Batch.DoesNotExist:
            return api_error('Batch not found.', 404)

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
    FARMER sees only their own farms. SUPERVISOR/ADMIN see all.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error('Forbidden.', 403)

        qs = DiseaseDetection.objects.select_related('batch', 'batch__farm').order_by('-detected_at')

        if request.user.role == 'FARMER':
            qs = qs.filter(batch__farm__owner=request.user)
        elif request.user.role == 'SUPERVISOR':
            if request.user.cooperative_id:
                qs = qs.filter(
                    batch__farm__owner__cooperative_id=request.user.cooperative_id,
                    batch__farm__owner__role='FARMER',
                )
            else:
                qs = qs.none()
        # ADMIN: no filter

        farm_id   = request.query_params.get('farm_id')
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        limit     = min(int(request.query_params.get('limit', 200)), 500)

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
                    'farm_name': d.batch.farm.name if d.batch and d.batch.farm else '—',
                    'farm_id': d.batch.farm_id if d.batch else None,
                    'notes': d.notes,
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
                writer = csv.writer(buffer)
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
    Returns {result: count} aggregate — used for the frequency chart.
    Same filters as DetectionHistoryView.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN', 'FARMER'):
            return api_error('Forbidden.', 403)

        from django.db.models import Count

        qs = DiseaseDetection.objects.all()

        if request.user.role == 'FARMER':
            qs = qs.filter(batch__farm__owner=request.user)
        elif request.user.role == 'SUPERVISOR':
            if request.user.cooperative_id:
                qs = qs.filter(
                    batch__farm__owner__cooperative_id=request.user.cooperative_id,
                    batch__farm__owner__role='FARMER',
                )
            else:
                qs = qs.none()
        # ADMIN: no filter

        farm_id   = request.query_params.get('farm_id')
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')

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
    """GET /api/detections/recent?limit=20 — supervisor-wide detection history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error('Forbidden.', 403)

        limit = min(int(request.query_params.get('limit', 20)), 100)

        detections = (
            DiseaseDetection.objects
            .select_related('batch', 'batch__farm')
            .order_by('-detected_at')
        )
        if request.user.role == 'SUPERVISOR':
            if request.user.cooperative_id:
                detections = detections.filter(
                    batch__farm__owner__cooperative_id=request.user.cooperative_id,
                    batch__farm__owner__role='FARMER',
                )
            else:
                detections = detections.none()
        # ADMIN: no filter
        detections = detections[:limit]

        data = [
            {
                'id': d.id,
                'result': d.result,
                'confidence': d.confidence,
                'detected_at': d.detected_at.isoformat(),
                'batch_id': d.batch_id,
                'farm_name': d.batch.farm.name if d.batch and d.batch.farm else '—',
                'farm_id': d.batch.farm_id if d.batch else None,
            }
            for d in detections
        ]
        return api_success(data)
