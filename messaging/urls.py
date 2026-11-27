from django.urls import path

from .views import ConversationListView, ConversationView

# Mounted at /api/messages.
urlpatterns = [
    path('/conversations',          ConversationListView.as_view(), name='message_conversations'),
    path('/conversations/<str:pk>', ConversationView.as_view(),     name='message_conversation'),
]
