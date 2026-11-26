from django.urls import path

from .views import ContactCreateView, ContactListView, ContactRepliedView, ContactReplyView, ContactUnreadView

urlpatterns = [
    path('', ContactCreateView.as_view(), name='contact_create'),
]

admin_urlpatterns = [
    path('',               ContactListView.as_view(),   name='contact_list'),
    path('/unread',        ContactUnreadView.as_view(), name='contact_unread'),
    path('/<int:pk>/read', ContactListView.as_view(),   name='contact_read'),
    path('/<int:pk>/replied', ContactRepliedView.as_view(), name='contact_replied'),
    path('/<int:pk>/replies', ContactReplyView.as_view(), name='contact_replies'),
]
