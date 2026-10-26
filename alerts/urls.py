from django.urls import path

from .sse_view import alert_stream
from .views import (
    AlertListView,
    AlertMarkAllReadView,
    AlertMarkReadView,
    AlertsByBatchView,
    AlertStreamTicketView,
)

urlpatterns = [
    path('', AlertListView.as_view(), name='alert_list'),                                    # GET  /api/alerts
    path('/stream-ticket', AlertStreamTicketView.as_view(), name='alert_stream_ticket'),     # POST /api/alerts/stream-ticket
    path('/stream', alert_stream, name='alert_stream'),                                      # GET  /api/alerts/stream?ticket=<ticket>
    path('/mark-all-read', AlertMarkAllReadView.as_view(), name='alert_mark_all_read'),      # POST /api/alerts/mark-all-read
    path('/batch/<str:batch_id>', AlertsByBatchView.as_view(), name='alerts_by_batch'),      # GET  /api/alerts/batch/<id>
    path('/<str:pk>/read', AlertMarkReadView.as_view(), name='alert_mark_read'),             # PATCH /api/alerts/<id>/read
]
