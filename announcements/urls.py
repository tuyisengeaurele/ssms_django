from django.urls import path

from .views import (
    AdminAnnouncementEndView,
    AdminAnnouncementsView,
    AdminAnnouncementView,
    CurrentAnnouncementsView,
    PublicAnnouncementsView,
)

urlpatterns = [
    path('',        CurrentAnnouncementsView.as_view(), name='announcements_current'),
    path('/public', PublicAnnouncementsView.as_view(),  name='announcements_public'),
]

# Mounted at /api/admin/announcements.
admin_urlpatterns = [
    path('',                 AdminAnnouncementsView.as_view(),   name='admin_announcements'),
    path('/<int:pk>',        AdminAnnouncementView.as_view(),    name='admin_announcement'),
    path('/<int:pk>/end',    AdminAnnouncementEndView.as_view(), name='admin_announcement_end'),
]
