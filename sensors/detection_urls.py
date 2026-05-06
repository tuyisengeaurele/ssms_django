from django.urls import path
from .detection_views import DiseaseDetectionCreateView, DiseaseDetectionByBatchView

urlpatterns = [
    path('', DiseaseDetectionCreateView.as_view(), name='detection_create'),                       # POST /api/detections
    path('/batch/<str:batch_id>', DiseaseDetectionByBatchView.as_view(), name='detection_by_batch'),  # GET /api/detections/batch/<id>
]
