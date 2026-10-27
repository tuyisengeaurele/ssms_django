from django.urls import path

from .sse_view import alert_stream
from .views import (
    AlertListView,
    AlertMarkAllReadView,
    AlertMarkReadView,
    AlertMarkUnreadView,
    AlertsByBatchView,
    AlertStreamTicketView,
    StageThresholdDetailView,
    StageThresholdListView,
)

urlpatterns = [
    path('/thresholds', StageThresholdListView.as_view(), name='stage_threshold_list'),                  # GET /api/alerts/thresholds
    path('/thresholds/<str:stage>', StageThresholdDetailView.as_view(), name='stage_threshold_detail'),  # PUT /api/alerts/thresholds/<stage>
    path('', AlertListView.as_view(), name='alert_list'),                                    # GET  /api/alerts
    path('/stream-ticket', AlertStreamTicketView.as_view(), name='alert_stream_ticket'),     # POST /api/alerts/stream-ticket
    path('/stream', alert_stream, name='alert_stream'),                                      # GET  /api/alerts/stream?ticket=<ticket>
    path('/mark-all-read', AlertMarkAllReadView.as_view(), name='alert_mark_all_read'),      # POST /api/alerts/mark-all-read
    path('/batch/<str:batch_id>', AlertsByBatchView.as_view(), name='alerts_by_batch'),      # GET  /api/alerts/batch/<id>
    path('/<str:pk>/read', AlertMarkReadView.as_view(), name='alert_mark_read'),             # PATCH /api/alerts/<id>/read
    path('/<str:pk>/unread', AlertMarkUnreadView.as_view(), name='alert_mark_unread'),       # PATCH /api/alerts/<id>/unread
]
