from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from core.utils import health_check

urlpatterns = [
    path('api/health/', health_check),
    path('api/auth/', include('users.urls')),
    path('api/farms/', include('farms.urls')),
    path('api/batches/', include('batches.urls')),
    path('api/sensors/', include('sensors.urls')),
    path('api/alerts/', include('alerts.urls')),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
