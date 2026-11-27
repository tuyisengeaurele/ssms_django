from django.urls import path

from .views import ConversationListView, ConversationView, ReadView, SendView, UpdatesView

# Mounted at /api/messages.
urlpatterns = [
    path('/conversations',          ConversationListView.as_view(), name='message_conversations'),
    path('/conversations/<str:pk>', ConversationView.as_view(),     name='message_conversation'),
    path('/send',                   SendView.as_view(),             name='message_send'),
    path('/read',                   ReadView.as_view(),             name='message_read'),
    path('/updates',                UpdatesView.as_view(),          name='message_updates'),
]
