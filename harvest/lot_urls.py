from django.urls import path

from .share_views import PublicLotView

urlpatterns = [
    path('/<str:token>', PublicLotView.as_view(), name='lot_public'),   # GET /api/lots/<token> (public)
]
