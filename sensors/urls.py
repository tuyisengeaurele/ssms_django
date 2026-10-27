from django.urls import path

from .views import (
    DeviceIngestView,
    IoTDeviceDetailView,
    IoTDeviceListView,
    SensorChartView,
    SensorReadingByBatchView,
    SensorReadingCreateView,
)

urlpatterns = [
    path('', SensorReadingCreateView.as_view(), name='sensor_create'),                          # POST /api/sensors
    path('/chart', SensorChartView.as_view(), name='sensor_chart'),                             # GET  /api/sensors/chart
    path('/batch/<str:batch_id>', SensorReadingByBatchView.as_view(), name='sensor_by_batch'),  # GET  /api/sensors/batch/<id>
]

device_urlpatterns = [
    path('',           IoTDeviceListView.as_view(),   name='device_list'),    # GET /api/devices
    path('/ingest',    DeviceIngestView.as_view(),    name='device_ingest'),  # POST /api/devices/ingest (device key)
    path('/<str:pk>',  IoTDeviceDetailView.as_view(), name='device_detail'),  # GET /api/devices/:id
]
