from django.urls import path

from .room_views import RoomDetailView, RoomReviewView

urlpatterns = [
    path('/<str:pk>', RoomDetailView.as_view(), name='room_detail'),            # PATCH / DELETE /api/rooms/<id>
    path('/<str:pk>/review', RoomReviewView.as_view(), name='room_review'),     # POST /api/rooms/<id>/review
]
