from django.urls import path

from .views import LocateView, PlaceListView

urlpatterns = [
    path('', PlaceListView.as_view(), name='place_list'),                  # GET /api/locations?parent=<code>
    path('/locate', LocateView.as_view(), name='place_locate'),            # POST /api/locations/locate {lat, lng}
]
