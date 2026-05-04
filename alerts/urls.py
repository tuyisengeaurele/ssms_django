from django.urls import path
from .views import AlertsByBatchView, AlertMarkReadView

urlpatterns = [
    path('/batch/<str:batch_id>', AlertsByBatchView.as_view(), name='alerts_by_batch'),  # /api/alerts/batch/<id>
    path('/<str:pk>/read', AlertMarkReadView.as_view(), name='alert_mark_read'),         # /api/alerts/<id>/read
]
