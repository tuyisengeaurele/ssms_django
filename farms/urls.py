from django.urls import path

from .room_views import FarmRoomListView
from .views import FarmDetailView, FarmListCreateView

urlpatterns = [
    path('', FarmListCreateView.as_view(), name='farm_list_create'),       # /api/farms
    path('/<str:farm_id>/rooms', FarmRoomListView.as_view(), name='farm_rooms'),   # GET / POST /api/farms/<id>/rooms
    path('/<str:pk>', FarmDetailView.as_view(), name='farm_detail'),       # /api/farms/<id>
]
