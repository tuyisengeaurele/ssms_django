from django.urls import path
from .views import FarmListCreateView, FarmDetailView

urlpatterns = [
    path('', FarmListCreateView.as_view(), name='farm_list_create'),       # /api/farms
    path('/<str:pk>', FarmDetailView.as_view(), name='farm_detail'),       # /api/farms/<id>
]
