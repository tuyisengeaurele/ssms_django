from django.urls import path

from .room_views import FarmRoomListView
from .views import FarmDetailView, FarmListCreateView, FarmRiskView, FarmSummaryView

urlpatterns = [
    path('', FarmListCreateView.as_view(), name='farm_list_create'),       # /api/farms
    path('/risk', FarmRiskView.as_view(), name='farm_risk'),               # GET /api/farms/risk
    path('/<str:farm_id>/rooms', FarmRoomListView.as_view(), name='farm_rooms'),   # GET / POST /api/farms/<id>/rooms
    path('/<str:pk>/summary', FarmSummaryView.as_view(), name='farm_summary'),     # GET /api/farms/<id>/summary?lang=
    path('/<str:pk>', FarmDetailView.as_view(), name='farm_detail'),       # /api/farms/<id>
]
