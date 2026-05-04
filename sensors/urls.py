from django.urls import path
from .views import SensorReadingCreateView, SensorReadingByBatchView

urlpatterns = [
    path('', SensorReadingCreateView.as_view(), name='sensor_create'),                          # /api/sensors
    path('/batch/<str:batch_id>', SensorReadingByBatchView.as_view(), name='sensor_by_batch'),  # /api/sensors/batch/<id>
]
