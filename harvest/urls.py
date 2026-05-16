from django.urls import path
from .views import HarvestListCreateView, HarvestStatsView, HarvestDeleteView, HarvestAllView

urlpatterns = [
    path('',                       HarvestAllView.as_view(),         name='harvest_all'),
    path('/batch/<str:batch_id>',  HarvestListCreateView.as_view(),  name='harvest_list_create'),
    path('/stats',                 HarvestStatsView.as_view(),        name='harvest_stats'),
    path('/<str:pk>',              HarvestDeleteView.as_view(),       name='harvest_delete'),
]
