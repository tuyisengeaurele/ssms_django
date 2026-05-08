from django.urls import path
from .views import CooperativeListCreateView, CooperativeDetailView

urlpatterns = [
    path('', CooperativeListCreateView.as_view(), name='cooperative_list_create'),
    path('/<str:pk>', CooperativeDetailView.as_view(), name='cooperative_detail'),
]
