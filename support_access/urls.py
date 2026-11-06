from django.urls import path

from .views import (
    SupportCancelView,
    SupportDetailView,
    SupportEndView,
    SupportMineView,
    SupportRequestView,
    SupportStartView,
    SupportTokenView,
)

# Mounted at /api/support-access. `mine` comes before the id, so it is not read as one.
urlpatterns = [
    path('', SupportRequestView.as_view(), name='support_request'),                      # POST: ask
    path('/mine', SupportMineView.as_view(), name='support_mine'),                       # GET: my open and recent requests
    path('/<str:pk>', SupportDetailView.as_view(), name='support_detail'),               # GET: one request, polled while waiting
    path('/<str:pk>/cancel', SupportCancelView.as_view(), name='support_cancel'),        # POST
    path('/<str:pk>/start', SupportStartView.as_view(), name='support_start'),           # POST: begin, returns the token
    path('/<str:pk>/token', SupportTokenView.as_view(), name='support_token'),           # POST: a new token for a running visit
    path('/<str:pk>/end', SupportEndView.as_view(), name='support_end'),                 # POST
]
