from django.urls import path

from .views import (
    SupportCancelView,
    SupportDetailView,
    SupportEndOwnView,
    SupportEndView,
    SupportHistoryView,
    SupportMineView,
    SupportPendingView,
    SupportRequestView,
    SupportRespondView,
    SupportStartView,
    SupportTokenView,
)

# Mounted at /api/support-access. `mine` and `for-me` come before the id, so they are not read as one.
urlpatterns = [
    # The admin's side.
    path('', SupportRequestView.as_view(), name='support_request'),                      # POST: ask
    path('/mine', SupportMineView.as_view(), name='support_mine'),                       # GET: my open and recent requests
    # The person's side.
    path('/for-me/pending', SupportPendingView.as_view(), name='support_pending'),       # GET: the question waiting, a visit running
    path('/for-me/history', SupportHistoryView.as_view(), name='support_history'),       # GET: every request about my account
    path('/for-me/<str:pk>/respond', SupportRespondView.as_view(), name='support_respond'),   # POST: allow or reject
    path('/for-me/<str:pk>/end', SupportEndOwnView.as_view(), name='support_end_own'),   # POST: stop a visit
    # The admin's side, by id.
    path('/<str:pk>', SupportDetailView.as_view(), name='support_detail'),               # GET: one request, polled while waiting
    path('/<str:pk>/cancel', SupportCancelView.as_view(), name='support_cancel'),        # POST
    path('/<str:pk>/start', SupportStartView.as_view(), name='support_start'),           # POST: begin, returns the token
    path('/<str:pk>/token', SupportTokenView.as_view(), name='support_token'),           # POST: a new token for a running visit
    path('/<str:pk>/end', SupportEndView.as_view(), name='support_end'),                 # POST
]
