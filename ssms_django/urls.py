from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView
from core.utils import health_check

urlpatterns = [
    path('api/health', health_check),
    path('api/auth/', include('users.urls')),          # /api/auth/register, /api/auth/login, /api/auth/me
    path('api/farms', include('farms.urls')),          # /api/farms, /api/farms/<id>
    path('api/batches', include('batches.urls')),      # /api/batches, /api/batches/<id>, ...
    path('api/sensors', include('sensors.urls')),      # /api/sensors, /api/sensors/batch/<id>
    path('api/alerts', include('alerts.urls')),        # /api/alerts/batch/<id>, /api/alerts/<id>/read
    path('api/detections', include('sensors.detection_urls')),  # /api/detections, /api/detections/batch/<id>
    path('api/cooperatives', include('cooperatives.urls')),      # /api/cooperatives, /api/cooperatives/<id>
    path('api/admin', include('users.admin_urls')),              # /api/admin/users, /api/admin/users/<id>/role
    path('api/harvest', include('harvest.urls')),               # /api/harvest/batch/<id>, /api/harvest/stats
    path('api/auth/token/refresh', TokenRefreshView.as_view(), name='token_refresh'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
