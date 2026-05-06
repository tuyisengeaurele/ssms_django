from django.urls import path
from .views import BatchCreateView, BatchByFarmView, BatchDetailView, BatchUpdateStageView

urlpatterns = [
    path('', BatchCreateView.as_view(), name='batch_create'),                          # /api/batches
    path('/farm/<str:farm_id>', BatchByFarmView.as_view(), name='batch_by_farm'),      # /api/batches/farm/<id>
    path('/<str:pk>', BatchDetailView.as_view(), name='batch_detail'),                 # /api/batches/<id>
    path('/<str:pk>/stage', BatchUpdateStageView.as_view(), name='batch_update_stage'),# /api/batches/<id>/stage
]
