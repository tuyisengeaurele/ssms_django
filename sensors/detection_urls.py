from django.urls import path

from .detection_views import (
    DetectionHistoryView,
    DetectionStatsView,
    DiseaseDetectionByBatchView,
    DiseaseDetectionCreateView,
    DiseaseDetectionFeedbackView,
    RecentDetectionsView,
)

urlpatterns = [
    path('', DiseaseDetectionCreateView.as_view(), name='detection_create'),                          # POST /api/detections
    path('/recent', RecentDetectionsView.as_view(), name='detection_recent'),                         # GET  /api/detections/recent
    path('/history', DetectionHistoryView.as_view(), name='detection_history'),                       # GET  /api/detections/history
    path('/stats', DetectionStatsView.as_view(), name='detection_stats'),                             # GET  /api/detections/stats
    path('/batch/<str:batch_id>', DiseaseDetectionByBatchView.as_view(), name='detection_by_batch'),  # GET  /api/detections/batch/<id>
    path('/<str:pk>/feedback', DiseaseDetectionFeedbackView.as_view(), name='detection_feedback'),   # POST /api/detections/<id>/feedback
]
