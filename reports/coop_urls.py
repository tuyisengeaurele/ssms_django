from django.urls import path

from .coop_views import CooperativeReportView

urlpatterns = [
    path('', CooperativeReportView.as_view(), name='cooperative_report'),   # GET /api/reports/cooperative
]
