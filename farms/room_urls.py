from django.urls import path

from .room_views import RoomDetailView

urlpatterns = [
    path('/<str:pk>', RoomDetailView.as_view(), name='room_detail'),   # PATCH / DELETE /api/rooms/<id>
]
