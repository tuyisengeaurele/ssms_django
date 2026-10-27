from django.urls import path

from .views import CooperativeDetailView, CooperativeListCreateView, CooperativeRestoreView

urlpatterns = [
    path('', CooperativeListCreateView.as_view(), name='cooperative_list_create'),
    path('/<str:pk>/restore', CooperativeRestoreView.as_view(), name='cooperative_restore'),
    path('/<str:pk>', CooperativeDetailView.as_view(), name='cooperative_detail'),
]
