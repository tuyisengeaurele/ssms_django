from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from core.utils import health_check

urlpatterns = [
    path('api/health', health_check),
    path('api/auth/', include('users.urls')),          # /api/auth/register, /api/auth/login, /api/auth/me
    path('api/farms', include('farms.urls')),          # /api/farms, /api/farms/<id>
    path('api/batches', include('batches.urls')),      # /api/batches, /api/batches/<id>, ...
    path('api/sensors', include('sensors.urls')),      # /api/sensors, /api/sensors/batch/<id>
    path('api/alerts', include('alerts.urls')),        # /api/alerts/batch/<id>, /api/alerts/<id>/read
    path('api/auth/token/refresh', TokenRefreshView.as_view(), name='token_refresh'),
]
