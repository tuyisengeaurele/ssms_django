from django.urls import path

from .views import CurrentAnnouncementsView, PublicAnnouncementsView

urlpatterns = [
    path('',        CurrentAnnouncementsView.as_view(), name='announcements_current'),
    path('/public', PublicAnnouncementsView.as_view(),  name='announcements_public'),
]
