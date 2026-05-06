from django.urls import path
from .views import SensorReadingCreateView, SensorReadingByBatchView, SensorChartView

urlpatterns = [
    path('', SensorReadingCreateView.as_view(), name='sensor_create'),                          # POST /api/sensors
    path('/chart', SensorChartView.as_view(), name='sensor_chart'),                             # GET  /api/sensors/chart
    path('/batch/<str:batch_id>', SensorReadingByBatchView.as_view(), name='sensor_by_batch'),  # GET  /api/sensors/batch/<id>
]
