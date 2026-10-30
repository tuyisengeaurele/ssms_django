from django.urls import path

from .mortality_views import BatchMortalityDetailView, BatchMortalityView
from .views import (
    BatchActiveSupervisorView,
    BatchByFarmView,
    BatchCompareView,
    BatchCreateView,
    BatchDetailView,
    BatchReportView,
    BatchRoomView,
    BatchUpdateStageView,
)

urlpatterns = [
    path('', BatchCreateView.as_view(), name='batch_create'),                                  # POST /api/batches
    path('/active', BatchActiveSupervisorView.as_view(), name='batch_active_supervisor'),      # GET  /api/batches/active
    path('/compare', BatchCompareView.as_view(), name='batch_compare'),                       # GET  /api/batches/compare?ids=a,b
    path('/farm/<str:farm_id>', BatchByFarmView.as_view(), name='batch_by_farm'),              # GET  /api/batches/farm/<id>
    path('/<str:pk>', BatchDetailView.as_view(), name='batch_detail'),                         # GET/DELETE /api/batches/<id>
    path('/<str:pk>/report', BatchReportView.as_view(), name='batch_report'),                  # GET  /api/batches/<id>/report?lang=
    path('/<str:pk>/room', BatchRoomView.as_view(), name='batch_room'),                                   # POST /api/batches/<id>/room
    path('/<str:pk>/mortality', BatchMortalityView.as_view(), name='batch_mortality'),                      # GET/POST /api/batches/<id>/mortality
    path('/<str:pk>/mortality/<str:record_id>', BatchMortalityDetailView.as_view(), name='batch_mortality_detail'),  # DELETE
    path('/<str:pk>/stage', BatchUpdateStageView.as_view(), name='batch_update_stage'),        # PATCH /api/batches/<id>/stage
]
