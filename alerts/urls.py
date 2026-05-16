from django.urls import path
from .views import AlertListView, AlertsByBatchView, AlertMarkReadView, AlertMarkAllReadView
from .sse_view import AlertStreamView

urlpatterns = [
    path('', AlertListView.as_view(), name='alert_list'),                                    # GET  /api/alerts
    path('/stream', AlertStreamView.as_view(), name='alert_stream'),                         # GET  /api/alerts/stream?token=<jwt>
    path('/mark-all-read', AlertMarkAllReadView.as_view(), name='alert_mark_all_read'),      # POST /api/alerts/mark-all-read
    path('/batch/<str:batch_id>', AlertsByBatchView.as_view(), name='alerts_by_batch'),      # GET  /api/alerts/batch/<id>
    path('/<str:pk>/read', AlertMarkReadView.as_view(), name='alert_mark_read'),             # PATCH /api/alerts/<id>/read
]
