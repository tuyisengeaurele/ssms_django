from django.urls import path
from .views import BatchCreateView, BatchByFarmView, BatchDetailView, BatchUpdateStageView

urlpatterns = [
    path('', BatchCreateView.as_view(), name='batch_create'),
    path('farm/<str:farm_id>', BatchByFarmView.as_view(), name='batch_by_farm'),
    path('<str:pk>', BatchDetailView.as_view(), name='batch_detail'),
    path('<str:pk>/stage', BatchUpdateStageView.as_view(), name='batch_update_stage'),
]
