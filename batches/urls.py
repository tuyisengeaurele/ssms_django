from django.urls import path
from .views import BatchCreateView, BatchByFarmView, BatchDetailView, BatchUpdateStageView, BatchActiveSupervisorView

urlpatterns = [
    path('', BatchCreateView.as_view(), name='batch_create'),                                  # POST /api/batches
    path('/active', BatchActiveSupervisorView.as_view(), name='batch_active_supervisor'),      # GET  /api/batches/active
    path('/farm/<str:farm_id>', BatchByFarmView.as_view(), name='batch_by_farm'),              # GET  /api/batches/farm/<id>
    path('/<str:pk>', BatchDetailView.as_view(), name='batch_detail'),                         # GET/DELETE /api/batches/<id>
    path('/<str:pk>/stage', BatchUpdateStageView.as_view(), name='batch_update_stage'),        # PATCH /api/batches/<id>/stage
]
