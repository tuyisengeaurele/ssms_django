"""
Disease Detection views — POST /api/detections, GET /api/detections/batch/<batch_id>
Accepts an image upload, calls the FastAPI AI service, persists the result.
"""

import os
import httpx
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from batches.models import Batch
from .models import DiseaseDetection
from .serializers import DiseaseDetectionSerializer
from core.utils import api_success, api_error


def _save_image(uploaded_file) -> str:
    """Persist the uploaded image under MEDIA_ROOT/detections/ and return the relative URL."""
    save_dir = os.path.join(settings.MEDIA_ROOT, 'detections')
    os.makedirs(save_dir, exist_ok=True)

    # Use the DiseaseDetection id generator to get a unique filename
    from sensors.models import _generate_id
    ext = os.path.splitext(uploaded_file.name)[-1].lower() or '.jpg'
    filename = f'{_generate_id()}{ext}'
    filepath = os.path.join(save_dir, filename)

    with open(filepath, 'wb') as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)

    return f'{settings.MEDIA_URL}detections/{filename}'


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

        # Reset file pointer so we can save it
        image_file.seek(0)

        # Save image to disk
        image_url = _save_image(image_file)

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
