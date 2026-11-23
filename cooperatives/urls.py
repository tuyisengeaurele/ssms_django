from django.urls import path

from .change_request_views import CooperativeOptionsView
from .views import CooperativeDetailView, CooperativeListCreateView, CooperativeRestoreView

urlpatterns = [
    path('', CooperativeListCreateView.as_view(), name='cooperative_list_create'),
    path('/options', CooperativeOptionsView.as_view(), name='cooperative_options'),
    path('/<str:pk>/restore', CooperativeRestoreView.as_view(), name='cooperative_restore'),
    path('/<str:pk>', CooperativeDetailView.as_view(), name='cooperative_detail'),
]
