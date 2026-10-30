from django.urls import path

from .share_views import LotShareView
from .views import HarvestAllView, HarvestDeleteView, HarvestListCreateView, HarvestStatsView

urlpatterns = [
    path('',                       HarvestAllView.as_view(),         name='harvest_all'),
    path('/batch/<str:batch_id>',  HarvestListCreateView.as_view(),  name='harvest_list_create'),
    path('/stats',                 HarvestStatsView.as_view(),        name='harvest_stats'),
    path('/<str:pk>/share',        LotShareView.as_view(),            name='harvest_share'),
    path('/<str:pk>',              HarvestDeleteView.as_view(),       name='harvest_delete'),
]
